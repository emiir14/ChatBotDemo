-- ============================================================================
-- ChatBotDemo — Financiación: planes que el bot puede citar
-- ============================================================================
-- Ejecutar en el editor SQL de Supabase, después de migration_stock.sql.
-- Idempotente.
--
-- Cómo lo usa el bot: solo cita planes con activo = true y vigentes
-- (vigente_hasta nula o futura). Todo lo demás lo deriva al asesor.
-- Los 3 planes de ejemplo tienen valores ILUSTRATIVOS: el dueño debe
-- editarlos con los convenios reales de su concesionaria.
-- ============================================================================

create table if not exists public.financing_options (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,
  entidad         text not null default '',
  tna             numeric(6, 2),
  cft             numeric(6, 2),
  cuotas_min      integer check (cuotas_min is null or cuotas_min > 0),
  cuotas_max      integer check (cuotas_max is null or cuotas_max > 0),
  anticipo_min_pct integer check (anticipo_min_pct is null or (anticipo_min_pct >= 0 and anticipo_min_pct <= 100)),
  monto_max       numeric(14, 2),
  requisitos      text not null default '',
  vigente_hasta   date,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.financing_options enable row level security;

drop trigger if exists trg_financing_updated_at on public.financing_options;
create trigger trg_financing_updated_at
  before update on public.financing_options
  for each row
  execute function public.handle_updated_at();

revoke all on table public.financing_options from anon, authenticated;

-- Plantilla precargada (EJEMPLOS: editar con los convenios reales).
-- Solo inserta si la tabla está vacía (idempotente, no duplica). -----------
insert into public.financing_options
  (nombre, entidad, tna, cft, cuotas_min, cuotas_max, anticipo_min_pct, monto_max, requisitos, vigente_hasta, activo)
select * from (values
  ('12 cuotas fijas', 'Banco Nación', 27.00, 45.20, 12, 12, 30, 20000000,
   'Recibo de sueldo con 6 meses de antigüedad. Sujeto a evaluación crediticia.',
   '2026-12-31'::date, true),
  ('24 a 48 cuotas', 'Banco Nación', 35.00, 58.90, 24, 48, 20, 20000000,
   'Recibo de sueldo o monotributo con 1 año. Sujeto a evaluación crediticia.',
   '2026-12-31'::date, true),
  ('Tasa 0 promo de fábrica', 'Fábrica', 0.00, 0.00, 12, 12, 40, 10000000,
   'Solo modelos adheridos y hasta agotar cupo. Sujeto a evaluación crediticia.',
   '2026-11-30'::date, true)
) as seed(nombre, entidad, tna, cft, cuotas_min, cuotas_max, anticipo_min_pct, monto_max, requisitos, vigente_hasta, activo)
where not exists (select 1 from public.financing_options);
