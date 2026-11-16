import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDefaultTenant } from "@/lib/tenant";
import type { StockAlertItem } from "@/components/dashboard/types";
import type { StockDemandEstado } from "@/lib/stock-alerts-server";

const querySchema = z.object({
  estado: z
    .enum(["abiertas", "disponible", "pendiente", "descartado", "todas"])
    .default("abiertas"),
});

const SELECT = `
  id,lead_id,item_key,item_label,estado,asked_at,resolved_at,resolved_vehicle_id,
  lead:leads(id,telefono,nombre,auto_interes,origen_demo),
  vehicle:vehicles(id,marca,modelo,version,anio,precio,moneda)
`;

const RANK: Record<StockDemandEstado, number> = {
  disponible: 0,
  pendiente: 1,
  descartado: 2,
};

/** GET /api/dashboard/alerts?estado=abiertas|disponible|pendiente|descartado|todas */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    estado: url.searchParams.get("estado") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtro inválido" }, { status: 400 });
  }

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
  let query = supabase
    .from("stock_demands")
    .select(SELECT)
    .eq("tenant_id", tenant.id);

  if (parsed.data.estado === "abiertas") {
    query = query.in("estado", ["disponible", "pendiente"]);
  } else if (parsed.data.estado !== "todas") {
    query = query.eq("estado", parsed.data.estado);
  }

  const [{ data, error }, disponibles, pendientes, descartadas] = await Promise.all([
    query.order("asked_at", { ascending: false }).limit(300),
    supabase
      .from("stock_demands")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("estado", "disponible"),
    supabase
      .from("stock_demands")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("estado", "pendiente"),
    supabase
      .from("stock_demands")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("estado", "descartado"),
  ]);

  if (error) {
    return NextResponse.json(
      { error: `No se pudieron cargar las alertas: ${error.message}` },
      { status: 500 },
    );
  }

  const items = ((data ?? []) as unknown as StockAlertItem[]).sort((a, b) => {
    const byState = RANK[a.estado] - RANK[b.estado];
    if (byState !== 0) return byState;
    const aTime = a.resolved_at ?? a.asked_at;
    const bTime = b.resolved_at ?? b.asked_at;
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({
    items,
    counts: {
      disponible: disponibles.count ?? 0,
      pendiente: pendientes.count ?? 0,
      descartado: descartadas.count ?? 0,
    },
  });
}

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("dismiss"), id: z.string().uuid() }),
  z.object({ action: z.literal("dismiss_all") }),
  z.object({ action: z.literal("restore"), id: z.string().uuid() }),
]);

/** PATCH /api/dashboard/alerts — descartar (una o todas) o restaurar. */
export async function PATCH(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

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
  if (parsed.data.action === "dismiss_all") {
    const { data, error } = await supabase
      .from("stock_demands")
      .update({ estado: "descartado" })
      .eq("tenant_id", tenant.id)
      .eq("estado", "disponible")
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: `No se pudieron descartar: ${error.message}` },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, updated: (data ?? []).length });
  }

  const patch: { estado: string } =
    parsed.data.action === "restore"
      ? { estado: "pendiente" }
      : { estado: "descartado" };
  if (parsed.data.action === "restore") {
    // Restaurar devuelve la alerta a su estado real: si ya se había resuelto
    // con stock, vuelve a "disponible"; si no, sigue esperando stock.
    const { data: row } = await supabase
      .from("stock_demands")
      .select("resolved_at")
      .eq("tenant_id", tenant.id)
      .eq("id", parsed.data.id)
      .maybeSingle();
    patch.estado = (row as { resolved_at: string | null } | null)?.resolved_at
      ? "disponible"
      : "pendiente";
  }
  const { data, error } = await supabase
    .from("stock_demands")
    .update(patch)
    .eq("tenant_id", tenant.id)
    .eq("id", parsed.data.id)
    .select("id");
  if (error) {
    return NextResponse.json(
      { error: `No se pudo actualizar la alerta: ${error.message}` },
      { status: 500 },
    );
  }
  if ((data ?? []).length === 0) {
    return NextResponse.json({ error: "La alerta no existe" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, updated: 1 });
}
