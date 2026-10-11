import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { financingInputSchema } from "@/lib/financing";

/** GET /api/dashboard/financing — todos los planes (el bot filtra vigentes). */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("financing_options")
    .select("*")
    .order("activo", { ascending: false })
    .order("nombre");
  if (error) {
    return NextResponse.json(
      { error: `No se pudieron cargar los planes: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ items: data ?? [] });
}

/** POST /api/dashboard/financing — alta de plan. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = financingInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("financing_options").insert(parsed.data);
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
