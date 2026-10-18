-- ============================================================================
-- ChatBotDemo — Recontacto: distinguir bot vs agente
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase (idempotente).
--
-- Agrega la marca de tiempo del recontacto hecho por un AGENTE (botón WhatsApp).
-- El recontacto del BOT sigue usando estado = 'recontactado' SIN esta marca, así
-- se pueden distinguir ambos casos.
-- ============================================================================

alter table public.leads
  add column if not exists recontactado_agente_at timestamptz;

create index if not exists idx_leads_recontacto_agente
  on public.leads (recontactado_agente_at)
  where recontactado_agente_at is not null;
