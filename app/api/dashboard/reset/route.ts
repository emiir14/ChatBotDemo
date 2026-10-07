import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, isDemoMode } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({ confirm: z.literal(true) });

/**
 * POST /api/dashboard/reset { confirm: true } — vacía el panel para la
 * demo en vivo (muestra con datos → vacía → el bot lo llena en vivo).
 * Borra leads, mensajes y eventos procesados. El STOCK queda intacto.
 * Solo con DEMO_MODE=true. Para recuperar la demo, re-ejecutar
 * supabase/refresh_demo_data.sql en el editor SQL.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  if (!bodySchema.safeParse(body).success) {
    return NextResponse.json({ error: "Falta confirmación" }, { status: 400 });
  }
  let demo = false;
  try {
    demo = isDemoMode(getEnv());
  } catch {
    demo = false;
  }
  if (!demo) {
    return NextResponse.json(
      { error: "Solo disponible con DEMO_MODE=true" },
      { status: 403 },
    );
  }
  const supabase = getSupabaseAdmin();
  const { count } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true });
  await supabase.from("messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  const { error } = await supabase
    .from("leads")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) {
    return NextResponse.json(
      { error: `No se pudo vaciar: ${error.message}` },
      { status: 500 },
    );
  }
  await supabase
    .from("processed_events")
    .delete()
    .neq("wa_message_id", "__none__");
  return NextResponse.json({ ok: true, deletedLeads: count ?? 0 });
}
