import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/dashboard/status — endpoint LIVIANO para polling cada 4 s.
 * Devuelve solo conteos y el último cambio; el cliente refresca los datos
 * completos únicamente cuando lastChange avanza.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const { count: leadsTotal } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true });
  const { data: lastLead } = await supabase
    .from("leads")
    .select("updated_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { count: actionCount } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("requiere_humano", true)
    .is("atendido_at", null);

  return NextResponse.json({
    leadsTotal: leadsTotal ?? 0,
    lastChange: (lastLead as { updated_at?: string } | null)?.updated_at ?? null,
    actionCount: actionCount ?? 0,
  });
}
