import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const querySchema = z.object({
  temperatura: z.enum(["all", "caliente", "tibio", "frio"]).default("all"),
  estado: z
    .enum(["all", "nuevo", "en_conversacion", "derivado", "recontactado"])
    .default("all"),
  atendido: z
    .enum(["all", "asesor", "atendido", "revisado", "sin_atender"])
    .default("all"),
  recontacto: z.enum(["all", "bot", "agente"]).default("all"),
  sort: z
    .enum(["actividad", "nombre", "interes", "temperatura", "atendido"])
    .default("actividad"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().max(80).default(""),
  page: z.coerce.number().int().min(1).default(1),
  // Cola de acción: requiere_humano sin atender, o calientes sin atender.
  onlyAction: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PAGE_SIZE = 20;

/** Columnas donde busca el buscador (por cada palabra). */
const SEARCH_COLUMNS = [
  "nombre",
  "auto_interes",
  "presupuesto",
  "permuta",
  "atendido_por",
  "temperatura",
  "estado",
] as const;

const SORT_COLUMNS: Record<string, string> = {
  actividad: "last_customer_message_at",
  nombre: "nombre",
  interes: "auto_interes",
  temperatura: "temperatura",
  atendido: "atendido_por",
};

/** GET /api/dashboard/leads?temperatura=&estado=&atendido=&sort=&dir=&q=&page=&onlyAction= */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    temperatura: url.searchParams.get("temperatura") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
    atendido: url.searchParams.get("atendido") ?? undefined,
    recontacto: url.searchParams.get("recontacto") ?? undefined,
    sort: url.searchParams.get("sort") ?? undefined,
    dir: url.searchParams.get("dir") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    onlyAction: url.searchParams.get("onlyAction") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos" }, { status: 400 });
  }
  const { temperatura, estado, atendido, recontacto, sort, dir, q, page, onlyAction, limit } = parsed.data;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("leads")
    .select(
      "id,telefono,nombre,auto_interes,presupuesto,permuta,temperatura,requiere_humano,estado,origen_demo,atendido_at,atendido_por,recontactado_agente_at,last_customer_message_at,created_at",
      { count: "exact" },
    );

  if (temperatura !== "all") query = query.eq("temperatura", temperatura);
  if (estado !== "all") query = query.eq("estado", estado);
  if (atendido === "asesor") query = query.eq("requiere_humano", true);
  else if (atendido === "atendido") query = query.not("atendido_por", "is", null).neq("atendido_por", "Revisado");
  else if (atendido === "revisado") query = query.eq("atendido_por", "Revisado");
  else if (atendido === "sin_atender") query = query.is("atendido_por", null);
  if (recontacto === "bot") {
    query = query.eq("estado", "recontactado").is("recontactado_agente_at", null);
  } else if (recontacto === "agente") {
    query = query.not("recontactado_agente_at", "is", null);
  }
  if (onlyAction === "true") {
    query = query.eq("requiere_humano", true).is("atendido_at", null);
  }

  // Buscador: cada palabra debe aparecer en al menos una columna (AND entre palabras).
  const needle = q.trim();
  if (needle) {
    const words = needle.split(/\s+/).filter(Boolean).slice(0, 6);
    for (const raw of words) {
      const safe = raw.replace(/[%(),*]/g, "");
      if (!safe) continue;
      const parts = SEARCH_COLUMNS.map((c) => `${c}.ilike.%${safe}%`);
      const digits = safe.replace(/\D/g, "");
      if (digits.length >= 3) parts.push(`telefono.ilike.%${digits}%`);
      query = query.or(parts.join(","));
    }
  }

  // Cola de acción: los más recientes primero (los últimos 5).
  if (onlyAction === "true") {
    query = query.order("last_customer_message_at", {
      ascending: false,
      nullsFirst: true,
    });
  } else {
    query = query
      .order(SORT_COLUMNS[sort] ?? "last_customer_message_at", {
        ascending: dir === "asc",
        nullsFirst: false,
      })
      .order("created_at", { ascending: false });
  }

  const from = (page - 1) * PAGE_SIZE;
  const size = onlyAction === "true" ? 20 : limit;
  const { data, count, error } = await query.range(from, from + size - 1);
  if (error) {
    return NextResponse.json(
      { error: `No se pudieron cargar los leads: ${error.message}` },
      { status: 500 },
    );
  }
  return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize: size });
}
