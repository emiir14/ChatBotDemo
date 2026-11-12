-- ============================================================================
-- ChatBotDemo — MIGRACIÓN MULTI-TENANT (Múltiples Concesionarias / Clientes)
-- ============================================================================
-- Ejecutar en el SQL Editor de Supabase.
-- Idempotente y 100% retrocompatible con los datos existentes.
--
-- Pasos que realiza:
--   1. Crea la tabla public.tenants (concesionarias u organizaciones).
--   2. Inserta el tenant inicial por defecto ('astra' - Astra Automotores).
--   3. Agrega tenant_id a: leads, vehicles, financing_options, stock_settings,
--      stock_changes y push_subscriptions.
--   4. Asigna todos los registros históricos existentes al tenant inicial.
--   5. Ajusta las restricciones de unicidad:
--        - leads: único por (tenant_id, telefono) en lugar de solo telefono.
--        - vehicles: código único por (tenant_id, codigo).
--   6. Actualiza las funciones RPC del dashboard con p_tenant_id opcional.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA tenants
-- ----------------------------------------------------------------------------
create table if not exists public.tenants (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique,
  nombre                    text not null,
  direccion                 text not null default '',
  horarios                  text not null default '',
  telefono_contacto         text,
  whatsapp_phone_number_id  text unique,
  whatsapp_token            text,
  whatsapp_verify_token     text,
  meta_app_secret           text,
  gemini_api_key            text,
  gemini_models             text,
  dashboard_password        text,
  activo                    boolean not null default true,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

alter table public.tenants enable row level security;
revoke all on table public.tenants from anon, authenticated;

drop trigger if exists trg_tenants_updated_at on public.tenants;
create trigger trg_tenants_updated_at
  before update on public.tenants
  for each row
  execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Tenant por defecto (Astra Automotores) para migrar registros existentes
-- ----------------------------------------------------------------------------
insert into public.tenants (
  slug,
  nombre,
  direccion,
  horarios,
  whatsapp_phone_number_id,
  whatsapp_verify_token,
  dashboard_password
)
values (
  'astra',
  'Astra Automotores',
  'Olmos 1014',
  'Lunes a viernes de 9 a 18 hs, sábados de 9 a 13 hs',
  '1332851893247984',
  'demolive@2026demolive@2026',
  'demolive@2026'
)
on conflict (slug) do update set
  nombre = excluded.nombre,
  direccion = excluded.direccion,
  horarios = excluded.horarios;

-- Variable temporal con el id del tenant inicial
do $$
declare
  v_default_tenant_id uuid;
begin
  select id into v_default_tenant_id from public.tenants where slug = 'astra' limit 1;

  -- --------------------------------------------------------------------------
  -- 3. Agregar columna tenant_id a las tablas existentes
  -- --------------------------------------------------------------------------
  
  -- LEADS
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='tenant_id') then
    alter table public.leads add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
  update public.leads set tenant_id = v_default_tenant_id where tenant_id is null;

  -- VEHICLES
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='vehicles' and column_name='tenant_id') then
    alter table public.vehicles add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
  update public.vehicles set tenant_id = v_default_tenant_id where tenant_id is null;

  -- FINANCING_OPTIONS
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='financing_options' and column_name='tenant_id') then
    alter table public.financing_options add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
  update public.financing_options set tenant_id = v_default_tenant_id where tenant_id is null;

  -- STOCK_CHANGES
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stock_changes' and column_name='tenant_id') then
    alter table public.stock_changes add column tenant_id uuid references public.tenants(id) on delete cascade;
  end if;
  update public.stock_changes set tenant_id = v_default_tenant_id where tenant_id is null;

  -- PUSH_SUBSCRIPTIONS (ya tenía columna tenant_id en migration_push.sql)
  update public.push_subscriptions set tenant_id = v_default_tenant_id where tenant_id is null;

  -- --------------------------------------------------------------------------
  -- 4. Ajustar restricciones de unicidad (Constraint / Indices)
  -- --------------------------------------------------------------------------

  -- LEADS: quitar unique anterior de telefono y crear compuesto (tenant_id, telefono)
  alter table public.leads drop constraint if exists leads_telefono_key;
  drop index if exists public.idx_leads_telefono;
  drop index if exists public.uq_leads_tenant_telefono;

  create unique index if not exists uq_leads_tenant_telefono
    on public.leads (tenant_id, telefono);

  -- VEHICLES: código único por tenant
  drop index if exists public.uq_vehicles_codigo;
  drop index if exists public.uq_vehicles_tenant_codigo;

  create unique index if not exists uq_vehicles_tenant_codigo
    on public.vehicles (tenant_id, codigo);

end $$;

-- ----------------------------------------------------------------------------
-- 5. Índices de rendimiento por tenant
-- ----------------------------------------------------------------------------
create index if not exists idx_leads_tenant_id on public.leads (tenant_id);
create index if not exists idx_vehicles_tenant_id on public.vehicles (tenant_id);
create index if not exists idx_financing_tenant_id on public.financing_options (tenant_id);
create index if not exists idx_stock_changes_tenant_id on public.stock_changes (tenant_id);
create index if not exists idx_push_subs_tenant_id on public.push_subscriptions (tenant_id);

-- ----------------------------------------------------------------------------
-- 6. Actualización de funciones RPC para aceptar p_tenant_id opcional
-- ----------------------------------------------------------------------------

-- dashboard_summary
create or replace function public.dashboard_summary(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
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
      and (p_tenant_id is null or l.tenant_id = p_tenant_id)
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
      join public.leads l on m.lead_id = l.id
      where m.created_at >= p_from and m.created_at < p_to
        and (p_tenant_id is null or l.tenant_id = p_tenant_id)
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

-- dashboard_heatmap
create or replace function public.dashboard_heatmap(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
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
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1, 2;
$$;

-- dashboard_daily
create or replace function public.dashboard_daily(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
returns table (day date, n bigint)
language sql
stable
as $$
  select
    (first_message_at at time zone 'America/Argentina/Cordoba')::date as day,
    count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1
  order by 1;
$$;

-- dashboard_models
create or replace function public.dashboard_models(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
returns table (modelo text, consultas bigint)
language sql
stable
as $$
  select auto_interes as modelo, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and auto_interes is not null
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1
  order by 2 desc
  limit 8;
$$;

-- dashboard_temp_dist
create or replace function public.dashboard_temp_dist(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
returns table (temperatura text, n bigint)
language sql
stable
as $$
  select temperatura, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and temperatura is not null
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1
  order by 1;
$$;

-- dashboard_estado_dist
create or replace function public.dashboard_estado_dist(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
returns table (estado text, n bigint)
language sql
stable
as $$
  select estado, count(*)
  from public.leads
  where first_message_at >= p_from and first_message_at < p_to
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1
  order by 1;
$$;

-- dashboard_models_stages
create or replace function public.dashboard_models_stages(
  p_from timestamptz,
  p_to timestamptz,
  p_limit int default 6,
  p_tenant_id uuid default null
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
    and (p_tenant_id is null or tenant_id = p_tenant_id)
  group by 1
  order by 2 desc
  limit greatest(1, least(coalesce(p_limit, 6), 12));
$$;

-- dashboard_recontact
create or replace function public.dashboard_recontact(
  p_from timestamptz,
  p_to timestamptz,
  p_tenant_id uuid default null
)
returns jsonb
language sql
stable
as $$
  with base as (
    select *
    from public.leads
    where first_message_at >= p_from and first_message_at < p_to
      and estado = 'recontactado'
      and (p_tenant_id is null or tenant_id = p_tenant_id)
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

revoke all on function public.dashboard_summary(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_heatmap(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_daily(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_models(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_temp_dist(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_estado_dist(timestamptz, timestamptz, uuid) from anon, authenticated;
revoke all on function public.dashboard_models_stages(timestamptz, timestamptz, int, uuid) from anon, authenticated;
revoke all on function public.dashboard_recontact(timestamptz, timestamptz, uuid) from anon, authenticated;

