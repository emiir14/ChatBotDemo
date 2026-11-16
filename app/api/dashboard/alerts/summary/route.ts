import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getDefaultTenant } from "@/lib/tenant";

/**
 * GET /api/dashboard/alerts/summary — contadores para el badge del panel.
 * `nuevos`: alertas sin descartar (el ítem ya está disponible).
 * `pendientes`: ítems pedidos que todavía no entraron al stock.
 */
export async function GET(): Promise<NextResponse> {
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
  const [nuevos, pendientes] = await Promise.all([
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
  ]);

  if (nuevos.error || pendientes.error) {
    return NextResponse.json(
      {
        error: `No se pudieron contar las alertas: ${
          nuevos.error?.message ?? pendientes.error?.message ?? "error desconocido"
        }`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    nuevos: nuevos.count ?? 0,
    pendientes: pendientes.count ?? 0,
  });
}
