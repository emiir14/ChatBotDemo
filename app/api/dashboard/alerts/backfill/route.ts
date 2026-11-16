import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDefaultTenant } from "@/lib/tenant";
import {
  firstMatchingVehicle,
  itemKey,
  itemLabel,
  sameItemKey,
  type VehicleLike,
} from "@/lib/stock-alerts";
import type { AvailableVehicle } from "@/lib/stock-alerts-server";

const MAX_LEADS = 1000;
const CHUNK = 100;

interface LeadRow {
  id: string;
  auto_interes: string | null;
}

interface DemandRow {
  lead_id: string;
  item_key: string;
}

/**
 * POST /api/dashboard/alerts/backfill
 * Reconstruye demandas desde `leads.auto_interes` (el interés que el bot ya
 * guardó de conversaciones anteriores). Excluye leads demo: son ficticios y
 * llenarían la pestaña de alertas con ruido.
 */
export async function POST(): Promise<NextResponse> {
  let tenant;
  try {
    tenant = await getDefaultTenant();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Tenant no configurado" },
      { status: 500 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: vehicles, error: stockError } = await supabase
    .from("vehicles")
    .select("id,marca,modelo,version")
    .eq("estado", "disponible")
    .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`);
  if (stockError) {
    return NextResponse.json(
      { error: `No se pudo leer el stock: ${stockError.message}` },
      { status: 500 },
    );
  }

  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id,auto_interes")
    .or(`tenant_id.eq.${tenant.id},tenant_id.is.null`)
    .eq("origen_demo", false)
    .not("auto_interes", "is", null)
    .not("last_customer_message_at", "is", null)
    .order("last_customer_message_at", { ascending: false })
    .limit(MAX_LEADS);
  if (leadsError) {
    return NextResponse.json(
      { error: `No se pudieron leer los leads: ${leadsError.message}` },
      { status: 500 },
    );
  }

  const { data: existing, error: demandsError } = await supabase
    .from("stock_demands")
    .select("lead_id,item_key")
    .eq("tenant_id", tenant.id);
  if (demandsError) {
    return NextResponse.json(
      { error: `No se pudieron leer las demandas: ${demandsError.message}` },
      { status: 500 },
    );
  }

  const stock = (vehicles ?? []) as AvailableVehicle[];
  const byLead = new Map<string, string[]>();
  for (const demand of (existing ?? []) as DemandRow[]) {
    const keys = byLead.get(demand.lead_id) ?? [];
    keys.push(demand.item_key);
    byLead.set(demand.lead_id, keys);
  }

  const toInsert: Array<{
    tenant_id: string;
    lead_id: string;
    item_key: string;
    item_label: string;
    estado: "pendiente";
  }> = [];
  let enStock = 0;
  let yaRegistrados = 0;
  let sinItem = 0;

  for (const lead of (leads ?? []) as LeadRow[]) {
    const text = lead.auto_interes?.trim() ?? "";
    const key = itemKey(text);
    if (!key) {
      sinItem++;
      continue;
    }
    if (firstMatchingVehicle(key, stock as VehicleLike[])) {
      enStock++;
      continue;
    }
    const previous = byLead.get(lead.id) ?? [];
    if (previous.some((other) => sameItemKey(other, key))) {
      yaRegistrados++;
      continue;
    }
    previous.push(key);
    byLead.set(lead.id, previous);
    toInsert.push({
      tenant_id: tenant.id,
      lead_id: lead.id,
      item_key: key,
      item_label: itemLabel(text),
      estado: "pendiente",
    });
  }

  let created = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("stock_demands")
      .insert(chunk)
      .select("id");
    if (error) {
      return NextResponse.json(
        {
          error: `Se crearon ${created} de ${toInsert.length} alertas: ${error.message}`,
        },
        { status: 500 },
      );
    }
    created += (data ?? []).length;
  }

  return NextResponse.json({
    ok: true,
    revisados: (leads ?? []).length,
    created,
    enStock,
    yaRegistrados,
    sinItem,
  });
}
