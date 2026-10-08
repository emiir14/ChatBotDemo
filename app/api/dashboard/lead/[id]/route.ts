import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/dashboard/lead/[id] — ficha + conversación completa. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Lead inválido" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
  }
  const { data: messages, error: msgError } = await supabase
    .from("messages")
    .select("id,rol,texto,wa_message_id,created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  if (msgError) {
    return NextResponse.json(
      { error: `No se pudo cargar la conversación: ${msgError.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ lead, messages: messages ?? [] });
}
