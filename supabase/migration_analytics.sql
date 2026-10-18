-- ============================================================================
-- ChatBotDemo — Analítica avanzada del panel (Resumen de consultas)
-- ============================================================================
-- Ejecutar UNA vez en el editor SQL de Supabase (idempotente).
--
-- Agrega funciones de agregación para los gráficos nuevos + una tabla de
-- caché para las consultas pesadas (5-10 min) y así cuidar la cuota.
-- Todo queda accesible SOLO para la service role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Distribución por temperatura (caliente / tibio / frío)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_temp_dist(p_from timestamptz, p_to timestamptz)
returns table (temperatura text, n bigint)
language sql
stable
as $$
  select temperatura, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and temperatura is not null
  group by 1
  order by 1;
$$;

-- ----------------------------------------------------------------------------
-- 2. Distribución por etapa (nuevo / en_conversacion / derivado / recontactado)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_estado_dist(p_from timestamptz, p_to timestamptz)
returns table (estado text, n bigint)
language sql
stable
as $$
  select estado, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
  group by 1
  order by 1;
$$;

-- ----------------------------------------------------------------------------
-- 3. Embudo por modelo: top modelos con sus avances por etapa de interés
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_models_stages(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 6
)
returns table (modelo text, consultas bigint, calificados bigint, calientes bigint, derivados bigint)
language sql
stable
as $$
  select
    auto_interes as modelo,
    count(*) as consultas,
    count(*) filter (
      where nombre is not null and auto_interes is not null and presupuesto is not null
    ) as calificados,
    count(*) filter (where temperatura = 'caliente') as calientes,
    count(*) filter (where estado = 'derivado') as derivados
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and auto_interes is not null
  group by 1
  order by 2 desc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$$;

-- ----------------------------------------------------------------------------
-- 4. Recontacto: bot vs agente y efectividad (¿volvieron a responder?)
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_recontact(p_from timestamptz, p_to timestamptz)
returns jsonb
language sql
stable
as $$
  with base as (
    select *
    from public.leads
    where first_message_at >= p_from and first_message_at < p_to
      and estado = 'recontactado'
  )
  select jsonb_build_object(
    'total',        (select count(*) from base),
    'bot',          (select count(*) from base where recontactado_agente_at is null),
    'agente',       (select count(*) from base where recontactado_agente_at is not null),
    'respondieron', (
      select count(*) from base
      where last_customer_message_at is not null
        and (recontactado_agente_at is not null or last_bot_reply_at is not null)
        and last_customer_message_at > greatest(
          coalesce(recontactado_agente_at, '-infinity'::timestamptz),
          coalesce(last_bot_reply_at, '-infinity'::timestamptz)
        )
    )
  );
$$;

-- ----------------------------------------------------------------------------
-- 5. Demanda vs stock por rango de precio (USD de referencia)
--    El presupuesto es texto libre: se toma el PRIMER número y se infiere la
--    moneda (USD si dice usd/u$s/dólar; si no, se asume ARS y se convierte con
--    p_ars_per_usd, un tipo de cambio de referencia para la demo).
-- ----------------------------------------------------------------------------
create or replace function public.dashboard_price_demand(
  p_from timestamptz,
  p_to timestamptz,
  p_ars_per_usd numeric default 1200
)
returns table (bucket text, orden int, consultas bigint, stock bigint)
language sql
stable
as $$
  with rate as (select greatest(1, coalesce(p_ars_per_usd, 1200)) as r),
  raw as (
    select
      case
        when presupuesto is null then null
        when (regexp_match(presupuesto, '[0-9][0-9.,]*'))[1] is null then null
        else nullif(
          replace(replace((regexp_match(presupuesto, '[0-9][0-9.,]*'))[1], '.', ''), ',', ''),
          ''
        )::numeric
      end as amount,
      (presupuesto ilike '%usd%' or presupuesto ilike '%u$s%'
        or presupuesto ilike '%dólar%' or presupuesto ilike '%dolar%') as is_usd
    from public.leads
    where first_message_at >= p_from and first_message_at < p_to
  ),
  usd as (
    select
      case
        when amount is null then null
        when is_usd then amount
        else amount / (select r from rate)
      end as v
    from raw
  ),
  dem as (
    select
      case
        when v is null then 'Sin dato'
        when v < 20000 then 'Menos de USD 20.000'
        when v < 30000 then 'USD 20.000 a 30.000'
        when v < 40000 then 'USD 30.000 a 40.000'
        when v < 50000 then 'USD 40.000 a 50.000'
        else 'USD 50.000 o más'
      end as bucket,
      count(*) as n
    from usd
    group by 1
  ),
  stk as (
    select
      case
        when (case when moneda = 'USD' then precio else precio / (select r from rate) end) < 20000
          then 'Menos de USD 20.000'
        when (case when moneda = 'USD' then precio else precio / (select r from rate) end) < 30000
          then 'USD 20.000 a 30.000'
        when (case when moneda = 'USD' then precio else precio / (select r from rate) end) < 40000
          then 'USD 30.000 a 40.000'
        when (case when moneda = 'USD' then precio else precio / (select r from rate) end) < 50000
          then 'USD 40.000 a 50.000'
        else 'USD 50.000 o más'
      end as bucket,
      count(*) as n
    from public.vehicles
    where estado = 'disponible'
    group by 1
  )
  select
    b.bucket,
    b.orden,
    coalesce(dem.n, 0)::bigint as consultas,
    coalesce(stk.n, 0)::bigint as stock
  from (values
    ('Menos de USD 20.000', 1),
    ('USD 20.000 a 30.000', 2),
    ('USD 30.000 a 40.000', 3),
    ('USD 40.000 a 50.000', 4),
    ('USD 50.000 o más',    5),
    ('Sin dato',            6)
  ) as b(bucket, orden)
  left join dem on dem.bucket = b.bucket
  left join stk on stk.bucket = b.bucket
  order by b.orden;
$$;

-- ----------------------------------------------------------------------------
-- 6. Caché de consultas pesadas (evita recalcular cientos de agregados)
-- ----------------------------------------------------------------------------
create table if not exists public.analytics_cache (
  key        text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.analytics_cache enable row level security;

-- ----------------------------------------------------------------------------
-- 7. Solo service role: revocar anon y authenticated
-- ----------------------------------------------------------------------------
revoke all on function public.dashboard_temp_dist(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_estado_dist(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_models_stages(timestamptz, timestamptz, int) from anon, authenticated;
revoke all on function public.dashboard_recontact(timestamptz, timestamptz) from anon, authenticated;
revoke all on function public.dashboard_price_demand(timestamptz, timestamptz, numeric) from anon, authenticated;
