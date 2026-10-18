import { BUSINESS_TIME_ZONE } from "@/lib/time";

/**
 * Matemática pura del panel (testeable): mediana, variación, embudo,
 * insights por reglas (deterministas, sin IA) y rangos de período.
 */

// ---------------------------------------------------------------------------
// Mediana (no promedio, como pide la spec)
// ---------------------------------------------------------------------------
export function median(values: number[]): number | null {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 === 1
    ? nums[mid]
    : (nums[mid - 1] + nums[mid]) / 2;
}

/** Cota superior EXCLUSIVA válida para un rango personalizado: el inicio de
 * mañana en Córdoba. Así "hasta hoy" entra completo y nada futuro es válido.
 */
export function maxCustomTo(now: Date = new Date()): Date {
  return new Date(startOfCordobaDay(now).getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Valida un rango personalizado con cotas [from, to) en tiempo UTC: desde
 * antes que hasta, y sin fechas futuras (hora de Córdoba). Puro y testeable.
 */
export function validateCustomBounds(
  from: Date,
  to: Date,
  now: Date = new Date(),
): { ok: boolean; msg: string | null } {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime())) {
    return { ok: false, msg: "Rango inválido." };
  }
  if (from >= to) return { ok: false, msg: "Desde debe ser anterior a hasta." };
  if (to > maxCustomTo(now)) {
    return { ok: false, msg: "No podés seleccionar fechas futuras." };
  }
  return { ok: true, msg: null };
}

export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const min = seconds / 60;
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
}

// ---------------------------------------------------------------------------
// Tiempo de primera respuesta: histograma + % dentro del SLA
// ---------------------------------------------------------------------------
export const FIRST_RESPONSE_SLA_SECONDS = 5 * 60;

const RESPONSE_BUCKETS: Array<{ label: string; upper: number }> = [
  { label: "<30 s", upper: 30 },
  { label: "30 s a 1 min", upper: 60 },
  { label: "1 a 2 min", upper: 120 },
  { label: "2 a 5 min", upper: 300 },
  { label: "5 a 10 min", upper: 600 },
  { label: "10 a 30 min", upper: 1800 },
  { label: "más de 30 min", upper: Number.POSITIVE_INFINITY },
];

export interface ResponseHistogram {
  buckets: Array<{ label: string; n: number }>;
  withinSla: number;
  total: number;
  slaSeconds: number;
}

export function buildResponseHistogram(
  values: number[],
  slaSeconds: number = FIRST_RESPONSE_SLA_SECONDS,
): ResponseHistogram {
  const clean = values.filter((v) => Number.isFinite(v) && v >= 0);
  const buckets = RESPONSE_BUCKETS.map((b) => ({ label: b.label, n: 0 }));
  for (const v of clean) {
    const idx = RESPONSE_BUCKETS.findIndex((b) => v < b.upper);
    buckets[idx < 0 ? buckets.length - 1 : idx].n += 1;
  }
  return {
    buckets,
    withinSla: clean.filter((v) => v <= slaSeconds).length,
    total: clean.length,
    slaSeconds,
  };
}

// ---------------------------------------------------------------------------
// Variación vs período anterior: { pct } o null ("sin datos previos")
// ---------------------------------------------------------------------------
export function variation(
  current: number,
  previous: number,
): { pct: number; up: boolean } | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return null; // "sin datos previos", no un 0%
  const pct = ((current - previous) / previous) * 100;
  return { pct, up: pct >= 0 };
}

// ---------------------------------------------------------------------------
// Rangos de período en hora de Córdoba (el servidor corre en UTC)
// ---------------------------------------------------------------------------
export type PeriodKey = "today" | "7d" | "30d" | "all";

export interface PeriodRange {
  from: Date;
  to: Date;
  /** Duración en ms (para calcular el período anterior equivalente). */
  ms: number;
}

/** Rango personalizado (fechas ya validadas). */
export interface CustomSpec {
  key: "custom";
  from: Date;
  to: Date;
}

export type PeriodSpec = PeriodKey | CustomSpec;

function cordobaParts(d: Date): { y: number; mo: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (t: string): number =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get("year"), mo: get("month"), day: get("day") };
}

/** Medianoche de Córdoba expresada como instante UTC (ART = UTC-3 fijo). */
export function startOfCordobaDay(d: Date = new Date()): Date {
  const { y, mo, day } = cordobaParts(d);
  return new Date(Date.UTC(y, mo - 1, day, 3, 0, 0, 0));
}

/**
 * Rango personalizado desde fechas de calendario (AAAA-MM-DD): incluye el
 * día "hasta" completo en hora de Córdoba. Puro y testeable.
 */
export function customDayBounds(from: string, to: string): { from: Date; to: Date } {
  const [fy, fmo, fd] = from.split("-").map(Number);
  const [ty, tmo, td] = to.split("-").map(Number);
  return {
    from: new Date(Date.UTC(fy, fmo - 1, fd, 3, 0, 0, 0)),
    to: new Date(Date.UTC(ty, tmo - 1, td + 1, 3, 0, 0, 0)),
  };
}

export function periodRange(period: PeriodKey, now: Date = new Date()): PeriodRange {
  if (period === "today") {
    const from = startOfCordobaDay(now);
    return { from, to: now, ms: Math.max(1, now.getTime() - from.getTime()) };
  }
  if (period === "all") {
    // Histórico completo (desde 2020; la app no tiene datos anteriores).
    const from = new Date(Date.UTC(2020, 0, 1));
    return { from, to: now, ms: now.getTime() - from.getTime() };
  }
  const days = period === "7d" ? 7 : 30;
  const to = now;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, ms: days * 24 * 60 * 60 * 1000 };
}

/** Resuelve cualquier especificación (preset o personalizado) a un rango. */
export function resolveRange(spec: PeriodSpec, now: Date = new Date()): PeriodRange {
  if (typeof spec === "object") {
    const ms = spec.to.getTime() - spec.from.getTime();
    return { from: spec.from, to: spec.to, ms };
  }
  return periodRange(spec, now);
}

/** Etiqueta corta del período para la tarjeta Consultas. */
export function periodLabel(spec: PeriodSpec): string {
  if (typeof spec === "object") {
    const fmt = (d: Date): string =>
      new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE }).format(d);
    return `${fmt(spec.from)} – ${fmt(spec.to)}`;
  }
  if (spec === "today") return "hoy";
  if (spec === "7d") return "últimos 7 días";
  if (spec === "30d") return "últimos 30 días";
  return "todo el historial";
}

export function previousRange(range: PeriodRange): PeriodRange {
  return {
    from: new Date(range.from.getTime() - range.ms),
    to: range.from,
    ms: range.ms,
  };
}

// ---------------------------------------------------------------------------
// Embudo: pasos con % de conversión entre pasos consecutivos
// ---------------------------------------------------------------------------
export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  /** % respecto al paso anterior (null en el primero). */
  conversionFromPrev: number | null;
}

export function buildFunnel(steps: Array<{ key: string; label: string; value: number }>): FunnelStep[] {
  return steps.map((s, i) => ({
    ...s,
    conversionFromPrev:
      i === 0 || steps[i - 1].value === 0
        ? null
        : (s.value / steps[i - 1].value) * 100,
  }));
}

// ---------------------------------------------------------------------------
// Insights por reglas (deterministas, gratis)
// ---------------------------------------------------------------------------
export interface InsightInput {
  atendidas: number;
  fueraHorario: number;
  calientesSinAtender: number;
  topModelo: { modelo: string; consultas: number; stock: number } | null;
  pico: { dia: string; hora: number; n: number } | null;
}

export interface Insight {
  text: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export function diaNombre(isodow: number): string {
  return DIAS[isodow % 7] ?? "";
}

export function buildInsights(input: InsightInput): Insight[] {
  const out: Insight[] = [];
  if (input.atendidas > 0) {
    const pct = Math.round((input.fueraHorario / input.atendidas) * 100);
    if (pct >= 15) {
      out.push({
        text: `El ${pct}% de las consultas (${input.fueraHorario} de ${input.atendidas}) llega fuera de horario. Antes se perdían o esperaban a la mañana.`,
      });
    }
  }
  if (input.pico && input.pico.n > 0) {
    out.push({
      text: `El pico es el ${input.pico.dia} a las ${input.pico.hora} hs (${input.pico.n} consultas). Conviene tener un asesor atento en esa franja.`,
    });
  }
  if (input.topModelo) {
    const t = input.topModelo;
    if (t.stock === 0) {
      out.push({
        text: `Piden mucho ${t.modelo} (${t.consultas} consultas) y no hay stock. Cada consulta es una venta que se va a otra marca.`,
      });
    } else if (t.stock <= 1) {
      out.push({
        text: `Alta demanda de ${t.modelo} (${t.consultas} consultas) con solo ${t.stock} unidad disponible. Riesgo de quedarse sin entrega.`,
      });
    }
  }
  if (input.calientesSinAtender > 0) {
    out.push({
      text: `Hay ${input.calientesSinAtender} ${input.calientesSinAtender === 1 ? "lead caliente" : "leads calientes"} esperando atención. Son los que más facturan.`,
    });
  }
  return out.slice(0, 3);
}
