-- ============================================================================
-- ChatBotDemo — Stock: identidad, auditoría y frescura
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase, después de migration_dashboard.sql.
-- Idempotente.
--
-- 1. vehicles.codigo (código interno único, clave para importar sin duplicar)
--    y vehicles.patente (opcional: los 0km aún no tienen). Se backfillea
--    STK-001.. para el stock existente.
-- 2. vehicles.updated_at + trigger (reusa handle_updated_at).
-- 3. stock_settings (una sola fila: última actualización y umbral de alerta).
-- 4. stock_changes (registro: quién, qué, cuándo).
-- Todo accesible SOLO para la service role.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Identidad de cada auto
-- ----------------------------------------------------------------------------
alter table public.vehicles
  add column if not exists codigo text;
alter table public.vehicles
  add column if not exists patente text;
alter table public.vehicles
  add column if not exists updated_at timestamptz not null default now();

-- Backfill de códigos para el stock existente (solo los que no tienen)
with numerados as (
  select id, 'STK-' || lpad((row_number() over (order by created_at))::text, 3, '0') as nuevo
  from public.vehicles
  where codigo is null
)
update public.vehicles v
set codigo = n.nuevo
from numerados n
where v.id = n.id;

-- Unicidad de código (índice único; permite reintentos seguros del script)
do $$
begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'uq_vehicles_codigo'
  ) then
    -- Si hubiera duplicados legacy, numerarlos antes de crear el índice
    create unique index uq_vehicles_codigo on public.vehicles (codigo);
  end if;
end;
$$;

alter table public.vehicles enable row level security;

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row
  execute function public.handle_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Configuración de frescura (una fila)
-- ----------------------------------------------------------------------------
create table if not exists public.stock_settings (
  id                integer primary key default 1 check (id = 1),
  updated_at        timestamptz not null default now(),
  stale_days        integer not null default 2 check (stale_days >= 1),
  created_at        timestamptz not null default now()
);

alter table public.stock_settings enable row level security;

insert into public.stock_settings (id)
values (1)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- 3. Registro de cambios (quién, qué, cuándo)
-- ----------------------------------------------------------------------------
create table if not exists public.stock_changes (
  id          uuid primary key default gen_random_uuid(),
  vehicle_id  uuid references public.vehicles (id) on delete set null,
  codigo      text,
  accion      text not null
              check (accion in ('alta', 'edicion', 'estado', 'importacion', 'reemplazo', 'baja')),
  detalle     text not null default '',
  actor       text not null default 'dueño',
  created_at  timestamptz not null default now()
);

alter table public.stock_changes enable row level security;

create index if not exists idx_stock_changes_created
  on public.stock_changes (created_at desc);

revoke all on table public.stock_settings from anon, authenticated;
revoke all on table public.stock_changes from anon, authenticated;
