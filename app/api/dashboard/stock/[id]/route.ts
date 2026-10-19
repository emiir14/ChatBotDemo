import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logStockChange, touchStockSettings, vehicleInputSchema } from "@/lib/stock-server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = vehicleInputSchema.partial();

/** PATCH /api/dashboard/stock/[id] — edición o cambio rápido de estado. */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Vehículo inválido" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const patch: Record<string, unknown> = { ...parsed.data };
  if (patch.patente === "") patch.patente = null;
  // El código interno vacío nunca borra la identidad del vehículo.
  if (patch.codigo === "") delete patch.codigo;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const { data: prev } = await supabase
    .from("vehicles")
    .select("codigo,estado")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("vehicles").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo guardar: ${error.message}` },
      { status: 400 },
    );
  }
  const onlyEstado =
    Object.keys(parsed.data).length === 1 && parsed.data.estado !== undefined;
  await logStockChange(supabase, {
    vehicle_id: id,
    codigo: (prev as { codigo?: string } | null)?.codigo,
    accion: onlyEstado ? "estado" : "edicion",
    detalle: onlyEstado
      ? `Estado → ${parsed.data.estado}`
      : `Campos editados: ${Object.keys(parsed.data).join(", ")}`,
  });
  await touchStockSettings(supabase);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/dashboard/stock/[id] — baja definitiva (resetea la frescura). */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Vehículo inválido" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: prev } = await supabase
    .from("vehicles")
    .select("codigo,marca,modelo,version")
    .eq("id", id)
    .maybeSingle();
  if (!prev) {
    return NextResponse.json({ error: "El vehículo no existe" }, { status: 404 });
  }
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo eliminar: ${error.message}` },
      { status: 400 },
    );
  }
  const p = prev as { codigo?: string; marca?: string; modelo?: string; version?: string };
  await logStockChange(supabase, {
    // vehicle_id va en null: la fila ya no existe (la FK es ON DELETE SET NULL).
    vehicle_id: null,
    codigo: p.codigo,
    accion: "baja",
    detalle: `Eliminado: ${[p.marca, p.modelo, p.version].filter(Boolean).join(" ")}`.trim(),
  });
  await touchStockSettings(supabase);
  return NextResponse.json({ ok: true });
}
