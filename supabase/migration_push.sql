-- ============================================================================
-- Push notifications (Web Push / VAPID) — suscripciones por dispositivo
-- Ejecutar UNA vez en el SQL Editor de Supabase.
--
-- Diseño:
--  - Una fila por dispositivo/navegador (endpoint es único). Se hace upsert
--    por endpoint, así reactivar notificaciones no duplica.
--  - tenant_id y user_id quedan listos para el futuro multi-cliente /
--    vendedores. Hoy van en null (hay un solo panel, sin cuentas).
--  - RLS habilitado y SIN políticas públicas: solo la service role (backend)
--    toca esta tabla, igual que el resto del esquema.
-- ============================================================================

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,                     -- futuro: concesionaria (hoy null)
  user_id     uuid,                     -- futuro: vendedor (hoy null)
  endpoint    text not null unique,     -- único por dispositivo/navegador
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Índice para el disparo filtrado por tenant (cuando exista multi-cliente).
create index if not exists idx_push_subscriptions_tenant
  on public.push_subscriptions (tenant_id);

alter table public.push_subscriptions enable row level security;
