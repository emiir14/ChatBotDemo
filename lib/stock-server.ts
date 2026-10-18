import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Umbral por defecto (días) para la alerta de stock desactualizado. */
export const DEFAULT_STALE_DAYS = 4;

/** Schema compartido de alta/edición de vehículos. */
export const vehicleInputSchema = z.object({
  codigo: z.string().min(1).max(30),
  patente: z.string().max(12).optional().default(""),
  marca: z.string().min(1).max(60),
  modelo: z.string().min(1).max(60),
  version: z.string().max(120).optional().default(""),
  anio: z.number().int().min(1990).max(new Date().getFullYear() + 1),
  km: z.number().int().min(0).default(0),
  precio: z.number().positive(),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  combustible: z.string().max(30).optional().default("Nafta"),
  transmision: z.string().max(30).optional().default("Manual"),
  color: z.string().max(120).optional().default(""),
  estado: z.enum(["disponible", "reservado", "vendido"]).default("disponible"),
  es_0km: z.boolean().default(false),
  descripcion: z.string().max(500).optional().default(""),
});

/** Actualiza la fecha de última actualización del stock. */
export async function touchStockSettings(supabase: SupabaseClient): Promise<void> {
  await supabase
    .from("stock_settings")
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: "id" });
}

export type StockAction = "alta" | "edicion" | "estado" | "importacion" | "reemplazo" | "baja";

/** Registra un cambio (quién, qué, cuándo). Nunca lanza. */
export async function logStockChange(
  supabase: SupabaseClient,
  args: { vehicle_id?: string | null; codigo?: string; accion: StockAction; detalle: string; actor?: string },
): Promise<void> {
  try {
    await supabase.from("stock_changes").insert({
      vehicle_id: args.vehicle_id ?? null,
      codigo: args.codigo ?? null,
      accion: args.accion,
      detalle: args.detalle,
      actor: args.actor ?? "dueño",
    });
  } catch {
    // Auditoría best effort: no rompe la operación.
  }
}
