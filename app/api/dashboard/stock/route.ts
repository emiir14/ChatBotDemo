import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logStockChange, touchStockSettings, vehicleInputSchema } from "@/lib/stock-server";

/** GET /api/dashboard/stock — lista + frescura (para la alerta). */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const [{ data: vehicles, error }, { data: settings }] = await Promise.all([
    supabase.from("vehicles").select("*").order("marca").order("modelo"),
    supabase.from("stock_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo cargar el stock: ${error.message}` },
      { status: 500 },
    );
  }
  const s = (settings as { updated_at?: string; stale_days?: number } | null) ?? {};
  return NextResponse.json({
    vehicles: vehicles ?? [],
    settings: {
      updated_at: s.updated_at ?? null,
      stale_days: s.stale_days ?? 2,
    },
  });
}

/** POST /api/dashboard/stock — alta manual. */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = vehicleInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") },
      { status: 400 },
    );
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("vehicles")
    .insert({ ...parsed.data, patente: parsed.data.patente || null })
    .select("id")
    .single();
  if (error) {
    const dup = error.code === "23505" ? " (código duplicado)" : "";
    return NextResponse.json(
      { error: `No se pudo dar de alta${dup}: ${error.message}` },
      { status: 400 },
    );
  }
  await logStockChange(supabase, {
    vehicle_id: (data as { id: string }).id,
    codigo: parsed.data.codigo,
    accion: "alta",
    detalle: `${parsed.data.marca} ${parsed.data.modelo} ${parsed.data.version}`.trim(),
  });
  await touchStockSettings(supabase);
  return NextResponse.json({ ok: true });
}
