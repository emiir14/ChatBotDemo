-- ============================================================================
-- ChatBotDemo (concesionaria Córdoba) — ETAPA 1: esquema base
-- ============================================================================
-- Cómo ejecutarlo:
--   1. Abrí el editor SQL de Supabase (Dashboard > SQL Editor > New query).
--   2. Pegá TODO este archivo y ejecutalo (Run). Es idempotente: podés
--      correrlo más de una vez sin romper nada.
--   3. Después corré seed_vehicles.sql y luego seed_demo_leads.sql.
--
-- Decisiones:
--   - Se usan columnas TEXT + CHECK en lugar de ENUMs nativos de Postgres
--     para poder agregar valores sin migraciones complicadas.
--   - Row Level Security (RLS) habilitado en TODAS las tablas SIN políticas
--     públicas. Todo el acceso lo hace el servidor Next.js con la
--     service role key (SUPABASE_SECRET_KEY). Esa clave NUNCA va al cliente.
--   - La service_role de Supabase hace bypass de RLS por defecto, por eso
--     no hacen falta políticas para el backend.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. TABLA vehicles: stock de la concesionaria
-- ----------------------------------------------------------------------------
create table if not exists public.vehicles (
  id            uuid primary key default gen_random_uuid(),
  marca         text not null,
  modelo        text not null,
  version       text not null default '',
  anio          integer not null check (anio between 1990 and 2100),
  km            integer not null default 0 check (km >= 0),
  precio        numeric(14, 2) not null check (precio > 0),
  moneda        text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  combustible   text not null default 'Nafta',
  transmision   text not null default 'Manual',
  color         text not null default '',
  estado        text not null default 'disponible'
                check (estado in ('disponible', 'reservado', 'vendido')),
  es_0km        boolean not null default false,
  descripcion   text not null default '',
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. TABLA leads: cada teléfono de WhatsApp = un lead
-- ----------------------------------------------------------------------------
create table if not exists public.leads (
  id                        uuid primary key default gen_random_uuid(),
  telefono                  text not null unique,
  nombre                    text,
  auto_interes              text,
  presupuesto               text,
  permuta                   text,
  financiacion              boolean,
  urgencia                  text,
  temperatura               text check (temperatura in ('caliente', 'tibio', 'frio')),
  requiere_humano           boolean not null default false,
  resumen                   text,
  estado                    text not null default 'nuevo'
                            check (estado in ('nuevo', 'en_conversacion', 'derivado', 'recontactado')),
  origen_demo               boolean not null default false,
  first_message_at          timestamptz,
  last_customer_message_at  timestamptz,
  last_bot_reply_at         timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. TABLA messages: historial de cada conversación
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  rol           text not null check (rol in ('cliente', 'bot', 'sistema')),
  texto         text not null,
  wa_message_id text unique,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4. TABLA processed_events: deduplicación de webhooks de Meta
--    (Meta puede reenviar el mismo evento; el insert con ON CONFLICT
--    DO NOTHING lo ignora de forma atómica).
-- ----------------------------------------------------------------------------
create table if not exists public.processed_events (
  wa_message_id text primary key,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. ÍNDICES en los campos de consulta
-- ----------------------------------------------------------------------------
create index if not exists idx_leads_telefono
  on public.leads (telefono);

create index if not exists idx_leads_last_customer_message_at
  on public.leads (last_customer_message_at desc nulls last);

create index if not exists idx_leads_temperatura
  on public.leads (temperatura);

create index if not exists idx_messages_lead_created
  on public.messages (lead_id, created_at);

create index if not exists idx_messages_wa_message_id
  on public.messages (wa_message_id);

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY: habilitado en TODAS las tablas, SIN políticas
--    públicas. Solo la service role key (backend) accede.
-- ----------------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.leads enable row level security;
alter table public.messages enable row level security;
alter table public.processed_events enable row level security;

-- NOTA: a propósito NO se crea ninguna POLICY. Con RLS habilitado y sin
-- políticas, todo acceso con la clave pública/anónima es denegado.
-- El servidor usa SUPABASE_SECRET_KEY (service role), que hace bypass de RLS.

-- ----------------------------------------------------------------------------
-- 7. TRIGGER: mantener updated_at actualizado en leads
-- ----------------------------------------------------------------------------
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_updated_at on public.leads;

create trigger trg_leads_updated_at
  before update on public.leads
  for each row
  execute function public.handle_updated_at();
