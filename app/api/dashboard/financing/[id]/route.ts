import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { financingInputSchema } from "@/lib/financing";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PATCH /api/dashboard/financing/[id] — editar o activar/desactivar. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = financingInputSchema.partial().safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("financing_options")
    .update(parsed.data)
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
