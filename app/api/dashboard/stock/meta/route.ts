import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Metadatos del stock en una sola llamada:
 * GET /api/dashboard/stock/meta → { settings, changes }
 * PATCH /api/dashboard/stock/meta { stale_days } → umbral configurable.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const [{ data: settings }, { data: changes, error }] = await Promise.all([
    supabase.from("stock_settings").select("updated_at,stale_days").eq("id", 1).maybeSingle(),
    supabase
      .from("stock_changes")
      .select("id,codigo,accion,detalle,actor,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo cargar el historial: ${error.message}` },
      { status: 500 },
    );
  }
  const s = (settings as { updated_at?: string; stale_days?: number } | null) ?? {};
  return NextResponse.json({
    settings: { updated_at: s.updated_at ?? null, stale_days: s.stale_days ?? 4 },
    changes: changes ?? [],
  });
}

const settingsSchema = z.object({
  stale_days: z.number().int().min(1).max(30),
});

export async function PATCH(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Umbral inválido (1 a 30 días)" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("stock_settings")
    .upsert({ id: 1, stale_days: parsed.data.stale_days }, { onConflict: "id" });
  if (error) {
    return NextResponse.json({ error: `No se pudo guardar: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
