import { z } from "zod";

/**
 * Lógica PURA de importación de stock (testeable): plantilla CSV, parseo,
 * validación por fila y vista previa (nuevos / modificados / ausentes).
 * La lectura de Excel (.xlsx) la hace la ruta API con la lib `xlsx`;
 * acá solo se trabaja con filas ya parseadas.
 */

// ---------------------------------------------------------------------------
// Plantilla
// ---------------------------------------------------------------------------

export const TEMPLATE_COLUMNS = [
  "codigo",
  "patente",
  "marca",
  "modelo",
  "version",
  "anio",
  "km",
  "precio",
  "moneda",
  "combustible",
  "transmision",
  "color",
  "estado",
  "es_0km",
  "descripcion",
] as const;

export function buildTemplateCsv(): string {
  const header = TEMPLATE_COLUMNS.join(",");
  const ejemplo =
    "STK-001,,Toyota,Hilux,DX 2.4 TD 4x2 MT,2025,0,41200,USD,Diesel,Manual,Blanco,disponible,no,Pick-up cabina doble";
  return `${header}\n${ejemplo}\n`;
}

// ---------------------------------------------------------------------------
// Parseo CSV mínimo (comillas dobles, ; o , como separador)
// ---------------------------------------------------------------------------

export function detectDelimiter(firstLine: string): "," | ";" {
  const semis = (firstLine.match(/;/g) ?? []).length;
  const commas = (firstLine.match(/,/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "").trim();
  if (!clean) return [];
  const delimiter = detectDelimiter(clean.split("\n")[0]);
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // se ignora (lo maneja \n)
    } else {
      field += c;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Validación por fila
// ---------------------------------------------------------------------------

const CURRENT_YEAR = new Date().getFullYear();

const rowSchema = z.object({
  codigo: z.string().min(1, "código vacío"),
  patente: z.string().optional().default(""),
  marca: z.string().min(1, "marca vacía"),
  modelo: z.string().min(1, "modelo vacío"),
  version: z.string().optional().default(""),
  anio: z.coerce.number().int().min(1990, "año < 1990").max(CURRENT_YEAR + 1, "año futuro"),
  km: z.coerce.number().int().min(0, "km negativo").default(0),
  precio: z.coerce.number().positive("precio debe ser mayor a 0"),
  moneda: z.enum(["ARS", "USD"]).default("ARS"),
  combustible: z.string().optional().default("Nafta"),
  transmision: z.string().optional().default("Manual"),
  color: z.string().optional().default(""),
  estado: z.enum(["disponible", "reservado", "vendido"]).default("disponible"),
  es_0km: z.boolean().default(false),
  descripcion: z.string().optional().default(""),
});

export type ValidVehicleRow = z.infer<typeof rowSchema>;

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (["si", "sí", "true", "1", "x"].includes(v)) return true;
  if (["no", "false", "0", ""].includes(v)) return v === "" ? null : false;
  return null;
}

export interface RowError {
  fila: number;
  codigo: string;
  errores: string[];
}

export function validateRows(rows: string[][]): {
  valid: Array<{ fila: number; data: ValidVehicleRow }>;
  errors: RowError[];
} {
  const valid: Array<{ fila: number; data: ValidVehicleRow }> = [];
  const errors: RowError[] = [];
  if (rows.length === 0) return { valid, errors };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = ["codigo", "marca", "modelo", "precio"].filter((c) => !header.includes(c));
  if (missing.length > 0) {
    return {
      valid,
      errors: [{ fila: 1, codigo: "", errores: [`Faltan columnas obligatorias: ${missing.join(", ")}`] }],
    };
  }
  const idx = (name: string): number => header.indexOf(name);

  for (let r = 1; r < rows.length; r++) {
    const fila = r + 1;
    const cells = rows[r];
    if (cells.every((c) => c === "")) continue; // fila vacía
    const raw: Record<string, string> = {};
    for (const col of TEMPLATE_COLUMNS) {
      const i = idx(col);
      raw[col] = i >= 0 ? (cells[i] ?? "") : "";
    }
    const bool = parseBool(raw.es_0km);
    if (raw.es_0km.trim() !== "" && bool === null) {
      errors.push({ fila, codigo: raw.codigo, errores: [`es_0km inválido ("${raw.es_0km}"): usá sí/no`] });
      continue;
    }
    const parsed = rowSchema.safeParse({ ...raw, es_0km: bool ?? false });
    if (!parsed.success) {
      errors.push({
        fila,
        codigo: raw.codigo,
        errores: parsed.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`),
      });
      continue;
    }
    valid.push({ fila, data: parsed.data });
  }
  return { valid, errors };
}

// ---------------------------------------------------------------------------
// Vista previa: nuevos / modificados / ausentes
// ---------------------------------------------------------------------------

export interface ExistingVehicle {
  codigo: string;
  patente: string | null;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  km: number;
  precio: number;
  moneda: string;
  combustible: string;
  transmision: string;
  color: string;
  estado: string;
  es_0km: boolean;
  descripcion: string;
}

export interface ModifiedRow {
  fila: number;
  codigo: string;
  cambios: string[];
  data: ValidVehicleRow;
}

export interface ImportPreview {
  nuevos: Array<{ fila: number; data: ValidVehicleRow }>;
  modificados: ModifiedRow[];
  ausentes: ExistingVehicle[];
  errores: RowError[];
  duplicadosEnArchivo: string[];
}

const COMPARE_FIELDS: Array<keyof ValidVehicleRow> = [
  "patente",
  "marca",
  "modelo",
  "version",
  "anio",
  "km",
  "precio",
  "moneda",
  "combustible",
  "transmision",
  "color",
  "estado",
  "es_0km",
  "descripcion",
];

function norm(value: unknown): string {
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value ?? "");
}

export function diffImport(
  valid: Array<{ fila: number; data: ValidVehicleRow }>,
  existing: ExistingVehicle[],
  errors: RowError[],
): ImportPreview {
  const byCodigo = new Map(existing.map((v) => [v.codigo, v]));
  const seen = new Set<string>();
  const duplicadosEnArchivo: string[] = [];
  const nuevos: ImportPreview["nuevos"] = [];
  const modificados: ModifiedRow[] = [];

  for (const { fila, data } of valid) {
    if (seen.has(data.codigo)) {
      if (!duplicadosEnArchivo.includes(data.codigo)) duplicadosEnArchivo.push(data.codigo);
      continue;
    }
    seen.add(data.codigo);
    const prev = byCodigo.get(data.codigo);
    if (!prev) {
      nuevos.push({ fila, data });
      continue;
    }
    const cambios = COMPARE_FIELDS.filter((f) => norm(prev[f as keyof ExistingVehicle]) !== norm(data[f]));
    if (cambios.length > 0) {
      modificados.push({ fila, codigo: data.codigo, cambios, data });
    }
  }

  const ausentes = existing.filter((v) => !seen.has(v.codigo));
  return { nuevos, modificados, ausentes, errores: errors, duplicadosEnArchivo };
}
