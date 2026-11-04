import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/dashboard/status — endpoint LIVIANO para polling cada 4 s.
 * Devuelve conteos y el último cambio (considerando updated_at y last_customer_message_at);
 * el cliente refresca los datos completos cuando lastChange avanza.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const { count: leadsTotal } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true });

  // Buscamos la última actividad real (mensaje de cliente o actualización del lead)
  const [{ data: byCustomerMsg }, { data: byUpdated }] = await Promise.all([
    supabase
      .from("leads")
      .select("last_customer_message_at")
      .not("last_customer_message_at", "is", null)
      .order("last_customer_message_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("leads")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastCustomerMsg = (byCustomerMsg as { last_customer_message_at?: string } | null)?.last_customer_message_at;
  const lastUpdated = (byUpdated as { updated_at?: string } | null)?.updated_at;
  const lastChange = [lastCustomerMsg, lastUpdated].filter(Boolean).sort().reverse()[0] ?? null;

  const { count: actionCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("requiere_humano", true)
    .is("atendido_at", null);

  const { count: hotCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("temperatura", "caliente");

  return NextResponse.json({
    leadsTotal: leadsTotal ?? 0,
    lastChange,
    actionCount: actionCount ?? 0,
    hotCount: hotCount ?? 0,
  });
}
