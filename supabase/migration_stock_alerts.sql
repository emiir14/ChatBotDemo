-- ============================================================================
-- ChatBotDemo — Alertas de stock (lo pidió un cliente y no había)
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase, después de migration_stock.sql y
-- migration_multitenant.sql. Idempotente.
--
-- Idea:
--   1. Cuando el bot detecta que un cliente preguntó por un ítem puntual
--      (marca + modelo) que NO está disponible, se guarda una demanda acá.
--   2. Cuando ese ítem ingresa al stock (alta, edición o importación), la
--      demanda pasa a "disponible" y el panel muestra la alerta con el lead
--      y la conversación donde se preguntó.
--   3. El dueño puede descartar la alerta cuando ya contactó al cliente.
--
-- Estados:
--   pendiente   → se preguntó, todavía no hay stock.
--   disponible  → el ítem entró al stock: alerta visible en /dashboard/alertas.
--   descartado  → el dueño la vio y la cerró.
--
-- La clave `item_key` es el modelo normalizado (sin marca, año ni versión):
-- "Toyota Hilux DX 2.4" y "hilux" comparten la misma demanda.
-- ============================================================================

create table if not exists public.stock_demands (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  lead_id             uuid not null references public.leads (id) on delete cascade,
  -- Modelo normalizado: "hilux", "corolla cross", etc.
  item_key            text not null,
  -- Texto original para mostrar: "Toyota Hilux".
  item_label          text not null,
  estado              text not null default 'pendiente'
                      check (estado in ('pendiente', 'disponible', 'descartado')),
  asked_at            timestamptz not null default now(),
  resolved_at         timestamptz,
  -- Vehículo que satisfizo la demanda (si se borra, la alerta queda igual).
  resolved_vehicle_id uuid references public.vehicles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Una sola demanda por lead e ítem: si vuelve a preguntar, se actualiza.
  constraint uq_stock_demands_lead_item unique (lead_id, item_key)
);

alter table public.stock_demands enable row level security;

create index if not exists idx_stock_demands_tenant_estado
  on public.stock_demands (tenant_id, estado);

create index if not exists idx_stock_demands_lead
  on public.stock_demands (lead_id);

drop trigger if exists trg_stock_demands_updated_at on public.stock_demands;
create trigger trg_stock_demands_updated_at
  before update on public.stock_demands
  for each row
  execute function public.handle_updated_at();

-- Solo el backend (service role) accede: sin políticas públicas.
revoke all on table public.stock_demands from anon, authenticated;
