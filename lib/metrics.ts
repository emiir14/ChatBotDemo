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

/** Segundos → etiqueta corta ("45 s", "3 min"). */
export function formatDurationShort(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)} s`;
  const min = seconds / 60;
  if (min < 60) return `${Math.round(min)} min`;
  return `${(min / 60).toFixed(1)} h`;
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
export type PeriodKey = "today" | "7d" | "30d";

export interface PeriodRange {
  from: Date;
  to: Date;
  /** Duración en ms (para calcular el período anterior equivalente). */
  ms: number;
}

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

export function periodRange(period: PeriodKey, now: Date = new Date()): PeriodRange {
  if (period === "today") {
    const from = startOfCordobaDay(now);
    return { from, to: now, ms: now.getTime() - from.getTime() };
  }
  const days = period === "7d" ? 7 : 30;
  const to = now;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, ms: days * 24 * 60 * 60 * 1000 };
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
