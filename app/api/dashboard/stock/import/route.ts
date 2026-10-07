import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  diffImport,
  parseCsv,
  validateRows,
  type ExistingVehicle,
  type ValidVehicleRow,
} from "@/lib/stock-import";
import { logStockChange, touchStockSettings } from "@/lib/stock-server";

const MAX_FILE_BYTES = 2 * 1024 * 1024;

const applySchema = z.object({
  step: z.literal("apply"),
  /** "update": altas+modificaciones. "replace": reemplaza TODA la base. */
  mode: z.enum(["update", "replace"]),
  rows: z.array(z.unknown()),
  /** Códigos ausentes que el dueño confirmó marcar como vendidos. */
  markSold: z.array(z.string()).default([]),
});

/**
 * POST /api/dashboard/stock/import
 * - FormData { file } → VISTA PREVIA (no escribe nada).
 * - JSON { step:"apply", mode, rows, markSold } → aplica.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const contentType = req.headers.get("content-type") ?? "";

  // ---- Paso 1: vista previa desde archivo (.csv, .xlsx, .xls) ----
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Subí un archivo .csv o .xlsx" }, { status: 400 });
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: "Archivo vacío o mayor a 2 MB" }, { status: 400 });
    }
    let rows: string[][];
    try {
      const name = (file as File).name?.toLowerCase() ?? "";
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        if (!sheet) throw new Error("sin hojas");
        rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as string[][];
      } else {
        rows = parseCsv(await file.text());
      }
    } catch {
      return NextResponse.json({ error: "No se pudo leer el archivo. Revisá el formato." }, { status: 400 });
    }
    const { valid, errors } = validateRows(rows);
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from("vehicles").select(
      "codigo,patente,marca,modelo,version,anio,km,precio,moneda,combustible,transmision,color,estado,es_0km,descripcion",
    );
    const preview = diffImport(valid, (existing ?? []) as ExistingVehicle[], errors);
    return NextResponse.json({
      nuevos: preview.nuevos,
      modificados: preview.modificados.map((m) => ({ fila: m.fila, codigo: m.codigo, cambios: m.cambios })),
      ausentes: preview.ausentes.map((v) => ({ codigo: v.codigo, marca: v.marca, modelo: v.modelo, version: v.version })),
      errores: preview.errores,
      duplicadosEnArchivo: preview.duplicadosEnArchivo,
      // Se devuelven las filas validadas para el paso apply (el cliente las reenvía).
      rows: valid.map((v) => v.data),
    });
  }

  // ---- Paso 2: aplicar ----
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = applySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase.from("vehicles").select("id,codigo");
  const existingByCodigo = new Map(((existing ?? []) as Array<{ id: string; codigo: string }>).map((v) => [v.codigo, v.id]));
  const rows = parsed.data.rows as ValidVehicleRow[];

  let altas = 0;
  let modificados = 0;

  if (parsed.data.mode === "replace") {
    // Reemplazo total: borra todo e inserta lo validado.
    const { error: delError } = await supabase.from("vehicles").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (delError) {
      return NextResponse.json({ error: `No se pudo reemplazar: ${delError.message}` }, { status: 500 });
    }
    for (const row of rows) {
      const { error } = await supabase.from("vehicles").insert({
        ...row,
        patente: row.patente || null,
      });
      if (!error) altas++;
    }
    await logStockChange(supabase, {
      accion: "reemplazo",
      detalle: `Base reemplazada por archivo: ${altas} vehículos`,
    });
  } else {
    for (const row of rows) {
      const id = existingByCodigo.get(row.codigo);
      if (!id) {
        const { data, error } = await supabase
          .from("vehicles")
          .insert({ ...row, patente: row.patente || null })
          .select("id")
          .single();
        if (!error && data) {
          altas++;
          await logStockChange(supabase, {
            vehicle_id: (data as { id: string }).id,
            codigo: row.codigo,
            accion: "importacion",
            detalle: `Alta por importación: ${row.marca} ${row.modelo}`,
          });
        }
      } else {
        const { error } = await supabase
          .from("vehicles")
          .update({ ...row, patente: row.patente || null })
          .eq("id", id);
        if (!error) modificados++;
      }
    }
    if (modificados > 0) {
      await logStockChange(supabase, {
        accion: "importacion",
        detalle: `Importación: ${altas} altas, ${modificados} modificados`,
      });
    }
    // Ausentes confirmados → vendidos (nunca automático).
    for (const codigo of parsed.data.markSold) {
      const id = existingByCodigo.get(codigo);
      if (!id) continue;
      await supabase.from("vehicles").update({ estado: "vendido" }).eq("id", id);
      await logStockChange(supabase, {
        vehicle_id: id,
        codigo,
        accion: "estado",
        detalle: "Marcado vendido: ausente en archivo (confirmado por dueño)",
      });
    }
  }

  await touchStockSettings(supabase);
  return NextResponse.json({ ok: true, altas, modificados });
}
