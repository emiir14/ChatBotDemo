import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToAll } from "@/lib/push-server";
import { getDefaultTenant } from "@/lib/tenant";
import {
  firstMatchingVehicle,
  itemKey,
  itemLabel,
  sameItemKey,
  type VehicleLike,
} from "@/lib/stock-alerts";

/**
 * Persistencia de las demandas de stock. Solo servidor (service role).
 *
 * Flujo:
 *   1. El webhook registra una demanda cuando el bot detecta un ítem puntual.
 *   2. Cada alta/edición/importación de stock llama a syncStockDemands().
 *   3. Las demandas que encuentran un vehículo disponible pasan a "disponible"
 *      y se envía un push (payload mínimo, sin contenido del chat).
 */

export type StockDemandEstado = "pendiente" | "disponible" | "descartado";

export interface StockDemand {
  id: string;
  tenant_id: string;
  lead_id: string;
  item_key: string;
  item_label: string;
  estado: StockDemandEstado;
  asked_at: string;
  resolved_at: string | null;
  resolved_vehicle_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailableVehicle extends VehicleLike {
  id: string;
}

export interface RegisterDemandResult {
  created: boolean;
  /** Motivo por el que no se creó (null si se creó). */
  skipped: "sin_item" | "en_stock" | "duplicado" | null;
  demandId?: string;
}

export interface SyncDemandsResult {
  resolved: number;
  items: Array<{ id: string; item_label: string; lead_id: string }>;
}

/** Stock disponible del tenant (incluye vehículos legacy sin tenant_id). */
export async function loadAvailableVehicles(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<AvailableVehicle[]> {
  const { data, error } = await supabase
    .from("vehicles")
    .select("id,marca,modelo,version")
    .eq("estado", "disponible")
    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  if (error) {
    throw new Error(`No se pudo leer el stock disponible: ${error.message}`);
  }
  return (data ?? []) as AvailableVehicle[];
}

/**
 * Registra que un lead preguntó por un ítem. Si el ítem ya está disponible no
 * crea una demanda (y resuelve una pendiente previa, si la hubiera).
 */
export async function registerStockDemand(
  supabase: SupabaseClient,
  args: {
    tenantId: string;
    leadId: string;
    itemText: string;
    /** Stock ya cargado, para evitar una consulta por mensaje. */
    vehicles?: AvailableVehicle[];
  },
): Promise<RegisterDemandResult> {
  const key = itemKey(args.itemText);
  if (!key) return { created: false, skipped: "sin_item" };
  const label = itemLabel(args.itemText) || args.itemText.trim();
  const vehicles = args.vehicles ?? (await loadAvailableVehicles(supabase, args.tenantId));

  const available = firstMatchingVehicle(key, vehicles);
  if (available) {
    // El ítem ya está en stock: si había una demanda pendiente, se resuelve.
    const { data: pending, error } = await supabase
      .from("stock_demands")
      .select("id,item_key")
      .eq("lead_id", args.leadId)
      .eq("estado", "pendiente");
    if (error) {
      throw new Error(`No se pudieron leer las demandas del lead: ${error.message}`);
    }
    const same = (pending ?? []).find((d) => sameItemKey(d.item_key, key));
    if (same) {
      const { error: upError } = await supabase
        .from("stock_demands")
        .update({
          estado: "disponible",
          resolved_at: new Date().toISOString(),
          resolved_vehicle_id: available.id,
        })
        .eq("id", same.id);
      if (upError) {
        throw new Error(`No se pudo resolver la demanda: ${upError.message}`);
      }
    }
    return { created: false, skipped: "en_stock" };
  }

  const { data: existing, error: readError } = await supabase
    .from("stock_demands")
    .select("id,item_key,estado")
    .eq("lead_id", args.leadId);
  if (readError) {
    throw new Error(`No se pudieron leer las demandas del lead: ${readError.message}`);
  }
  const same = (existing ?? []).find((d) => sameItemKey(d.item_key, key));
  if (same) {
    const patch: Record<string, unknown> = {
      item_label: label,
      asked_at: new Date().toISOString(),
    };
    // Si la había descartado y vuelve a preguntar, se reabre.
    if (same.estado === "descartado") {
      patch.estado = "pendiente";
      patch.resolved_at = null;
      patch.resolved_vehicle_id = null;
    }
    const { error: upError } = await supabase
      .from("stock_demands")
      .update(patch)
      .eq("id", same.id);
    if (upError) {
      throw new Error(`No se pudo actualizar la demanda: ${upError.message}`);
    }
    return { created: false, skipped: "duplicado", demandId: same.id };
  }

  const { data: created, error: insertError } = await supabase
    .from("stock_demands")
    .insert({
      tenant_id: args.tenantId,
      lead_id: args.leadId,
      item_key: key,
      item_label: label,
      estado: "pendiente",
    })
    .select("id")
    .single();
  if (insertError) {
    // Carrera con otro mensaje del mismo lead: la fila ya existe.
    if (insertError.code === "23505") {
      return { created: false, skipped: "duplicado" };
    }
    throw new Error(`No se pudo guardar la demanda: ${insertError.message}`);
  }
  return {
    created: true,
    skipped: null,
    demandId: (created as { id: string }).id,
  };
}

/**
 * Resuelve las demandas pendientes contra el stock disponible actual.
 * Idempotente: se puede llamar después de cualquier cambio de stock.
 */
export async function syncStockDemands(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<SyncDemandsResult> {
  const vehicles = await loadAvailableVehicles(supabase, tenantId);
  const { data: pending, error } = await supabase
    .from("stock_demands")
    .select("id,lead_id,item_key,item_label")
    .eq("tenant_id", tenantId)
    .eq("estado", "pendiente");
  if (error) {
    throw new Error(`No se pudieron leer las demandas pendientes: ${error.message}`);
  }

  const resolved: SyncDemandsResult["items"] = [];
  for (const demand of pending ?? []) {
    const vehicle = firstMatchingVehicle(demand.item_key, vehicles);
    if (!vehicle) continue;
    const { error: upError } = await supabase
      .from("stock_demands")
      .update({
        estado: "disponible",
        resolved_at: new Date().toISOString(),
        resolved_vehicle_id: vehicle.id,
      })
      .eq("id", demand.id);
    if (upError) {
      console.error(
        `[stock-alerts] no se pudo resolver la demanda ${demand.id}: ${upError.message}`,
      );
      continue;
    }
    resolved.push({
      id: demand.id,
      item_label: demand.item_label,
      lead_id: demand.lead_id,
    });
  }

  if (resolved.length > 0) {
    const first = resolved[0];
    await sendPushToAll(
      {
        title:
          resolved.length === 1
            ? "Ítem disponible"
            : `${resolved.length} ítems disponibles`,
        body:
          resolved.length === 1
            ? `${first.item_label} entró al stock. Hay una conversación esperando respuesta.`
            : `${first.item_label} y ${resolved.length - 1} más entraron al stock.`,
        url: "/dashboard/alertas",
        tag: "stock-alerts",
      },
      tenantId,
    );
  }

  return { resolved: resolved.length, items: resolved };
}

/**
 * Ejecuta el sync sin romper el guardado de stock si las alertas fallan.
 * El error queda visible en los logs del servidor.
 */
export async function syncStockDemandsSafe(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<number> {
  try {
    const { resolved } = await syncStockDemands(supabase, tenantId);
    return resolved;
  } catch (err) {
    console.error(
      `[stock-alerts] sync falló (tenant ${tenantId}): ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 0;
  }
}

/**
 * Igual que syncStockDemandsSafe pero resuelve el tenant del panel.
 * Pensado para las rutas de stock: nunca hacen fallar el guardado.
 */
export async function syncStockDemandsForPanel(
  supabase: SupabaseClient,
): Promise<number> {
  try {
    const tenant = await getDefaultTenant();
    return await syncStockDemandsSafe(supabase, tenant.id);
  } catch (err) {
    console.error(
      `[stock-alerts] no se pudo resolver el tenant para las alertas: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return 0;
  }
}
