-- ============================================================================
-- ChatBotDemo — ETAPA 3: migración del panel + funciones de agregación
-- ============================================================================
-- Ejecutar UNA vez en el editor SQL de Supabase, después de schema.sql.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE).
--
-- Todo queda accesible SOLO para la service role: se revocan permisos a
-- anon y authenticated. RLS sigue habilitado sin políticas públicas.
-- Todas las fechas se convierten a America/Argentina/Cordoba en SQL.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Columnas "Marcar como atendido"
-- ----------------------------------------------------------------------------
alter table public.leads
  add column if not exists atendido_at timestamptz;
alter table public.leads
  add column if not exists atendido_por text;

create index if not exists idx_leads_atendido
  on public.leads (atendido_at) where atendido_at is null;
create index if not exists idx_leads_first_message_at
  on public.leads (first_message_at desc nulls last);

-- ----------------------------------------------------------------------------
-- 2. ¿Fuera de horario comercial? (lun-vie 9-18, sáb 9-13, dom cerrado)
-- ----------------------------------------------------------------------------
create or replace function public.is_outside_business_hours(t timestamptz)
returns boolean
language sql
immutable
as $$
  select
    extract(isodow from t at time zone 'America/Argentina/Cordoba') = 7
    or (
      extract(isodow from t at time zone 'America/Argentina/Cordoba') = 6
      and (
        extract(hour from t at time zone 'America/Argentina/Cordoba') < 9
        or extract(hour from t at time zone 'America/Argentina/Cordoba') >= 13
      )
    )
    or (
      extract(isodow from t at time zone 'America/Argentina/Cordoba') between 1 and 5
      and (
        extract(hour from t at time zone 'America/Argentina/Cordoba') < 9
        or extract(hour from t at time zone 'America/Argentina/Cordoba') >= 18
      )
    );
$$;

-- ----------------------------------------------------------------------------
-- 3. Resumen del período (todo agregado en la base, devuelve un JSON)
--    Definiciones:
--    - consulta = lead con first_message_at en el rango
--    - atendida = con last_bot_reply_at en el rango
--    - calificado = nombre + auto_interes + presupuesto no nulos
--    - first_responses = segundos entre 1er mensaje y 1ra respuesta (la
--      mediana se calcula en la app con código testeado, sobre este array)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  with base as (
    select
      l.*,
      (
        select min(m.created_at)
        from public.messages m
        where m.lead_id = l.id and m.rol = 'bot'
      ) as first_bot_at
    from public.leads l
    where l.first_message_at >= p_from and l.first_message_at < p_to
  ),
  atendidas as (
    select * from base
    where last_bot_reply_at >= p_from and last_bot_reply_at < p_to
  )
  select jsonb_build_object(
    'consultas', (select count(*) from base),
    'atendidas', (select count(*) from atendidas),
    'calientes', (select count(*) from atendidas where temperatura = 'caliente'),
    'calificados', (
      select count(*) from base
      where nombre is not null and auto_interes is not null and presupuesto is not null
    ),
    'derivados', (select count(*) from base where estado = 'derivado'),
    'requieren_humano', (
      select count(*) from base where requiere_humano is true and atendido_at is null
    ),
    'fuera_horario', (
      select count(*) from atendidas
      where public.is_outside_business_hours(first_message_at)
    ),
    'demo_count', (select count(*) from base where origen_demo is true),
    'mensajes', (
      select count(*) from public.messages m
      where m.created_at >= p_from and m.created_at < p_to
    ),
    'first_responses', coalesce((
      select jsonb_agg(s order by s)
      from (
        select (extract(epoch from (first_bot_at - first_message_at)))::int as s
        from atendidas
        where first_bot_at is not null
          and first_bot_at >= first_message_at
      ) t
    ), '[]'::jsonb)
  );
$$;

-- ----------------------------------------------------------------------------
-- 4. Mapa de calor día (ISODOW 1-7) × hora (0-23) en hora de Córdoba
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_heatmap(p_from timestamptz, p_to timestamptz)
returns table (dow int, hour int, n bigint)
language sql
stable
as $$
  select
    (extract(isodow from first_message_at at time zone 'America/Argentina/Cordoba'))::int as dow,
    (extract(hour from first_message_at at time zone 'America/Argentina/Cordoba'))::int as hour,
    count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
  group by 1, 2;
$$;

-- ----------------------------------------------------------------------------
-- 5. Serie diaria (para sparklines de tendencia), en fecha de Córdoba
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_daily(p_from timestamptz, p_to timestamptz)
returns table (day date, n bigint)
language sql
stable
as $$
  select
    (first_message_at at time zone 'America/Argentina/Cordoba')::date as day,
    count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
  group by 1
  order by 1;
$$;

-- ----------------------------------------------------------------------------
-- 6. Modelos más consultados (texto libre de auto_interes)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_models(p_from timestamptz, p_to timestamptz)
returns table (modelo text, consultas bigint)
language sql
stable
as $$
  select auto_interes as modelo, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and auto_interes is not null
  group by 1
  order by 2 desc
  limit 8;
$$;

-- ----------------------------------------------------------------------------
-- 7. Solo service role: revocar anon y authenticated
-- ----------------------------------------------------------------------------
revoke all on function public.is_outside_business_hours(timestamptz) from anon, authenticated;
revoke all on function public.dashboard_summary(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_heatmap(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_daily(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_models(timestamptz, timestamptz) from anon, authenticated;
