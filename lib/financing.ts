import { z } from "zod";
import { todayCordobaDate } from "@/lib/time";

/** Plan de financiación tal como vive en la base. */
export interface FinancingOption {
  id: string;
  nombre: string;
  entidad: string;
  tna: number | null;
  cft: number | null;
  cuotas_min: number | null;
  cuotas_max: number | null;
  anticipo_min_pct: number | null;
  monto_max: number | null;
  requisitos: string;
  vigente_hasta: string | null;
  activo: boolean;
}

export const financingInputSchema = z.object({
  nombre: z.string().min(1).max(120),
  entidad: z.string().max(120).optional().default(""),
  tna: z.number().min(0).max(1000).nullable().optional(),
  cft: z.number().min(0).max(10000).nullable().optional(),
  cuotas_min: z.number().int().positive().nullable().optional(),
  cuotas_max: z.number().int().positive().nullable().optional(),
  anticipo_min_pct: z.number().int().min(0).max(100).nullable().optional(),
  monto_max: z.number().positive().nullable().optional(),
  requisitos: z.string().max(500).optional().default(""),
  vigente_hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (AAAA-MM-DD)").nullable().optional(),
  activo: z.boolean().default(true),
});

export type FinancingInput = z.infer<typeof financingInputSchema>;

/**
 * Solo lo que el bot puede citar: activo y vigente (vigente_hasta nula o
 * hoy/futura en fecha de Córdoba). Puro y testeable.
 */
export function activeFinancing(
  options: FinancingOption[],
  todayCordoba: string,
): FinancingOption[] {
  return options.filter(
    (o) => o.activo && (o.vigente_hasta === null || o.vigente_hasta >= todayCordoba),
  );
}

/** Hoy en Córdoba como AAAA-MM-DD (para comparar vigencias). */
export function todayCordoba(date: Date = new Date()): string {
  return todayCordobaDate(date);
}
