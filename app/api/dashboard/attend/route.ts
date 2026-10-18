import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const bodySchema = z.object({
  leadId: z.string().uuid(),
  // "Revisado" es válido: el chat se revisó sin que un agente lo atendiera.
  atendidoPor: z.string().trim().min(1, "Escribí quién atendió").max(80),
});

/** POST /api/dashboard/attend { leadId } — marca como atendido. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("leads")
    .update({
      atendido_at: new Date().toISOString(),
      atendido_por: parsed.data.atendidoPor,
    })
    .eq("id", parsed.data.leadId);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo marcar como atendido: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
