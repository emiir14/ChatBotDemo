import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase";

const querySchema = z.object({
  temperatura: z.enum(["all", "caliente", "tibio", "frio"]).default("all"),
  estado: z
    .enum(["all", "nuevo", "en_conversacion", "derivado", "recontactado"])
    .default("all"),
  q: z.string().max(60).default(""),
  page: z.coerce.number().int().min(1).default(1),
  // Cola de acción: requiere_humano sin atender, o calientes sin atender.
  onlyAction: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const PAGE_SIZE = 20;

/** GET /api/dashboard/leads?temperatura=&estado=&q=&page=&onlyAction= */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    temperatura: url.searchParams.get("temperatura") ?? undefined,
    estado: url.searchParams.get("estado") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: url.searchParams.get("page") ?? undefined,
    onlyAction: url.searchParams.get("onlyAction") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Filtros inválidos" }, { status: 400 });
  }
  const { temperatura, estado, q, page, onlyAction, limit } = parsed.data;
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("leads")
    .select(
      "id,telefono,nombre,auto_interes,presupuesto,permuta,temperatura,requiere_humano,estado,origen_demo,atendido_at,last_customer_message_at,created_at",
      { count: "exact" },
    );

  if (temperatura !== "all") query = query.eq("temperatura", temperatura);
  if (estado !== "all") query = query.eq("estado", estado);
  if (onlyAction === "true") {
    query = query.eq("requiere_humano", true).is("atendido_at", null);
  }
  const needle = q.trim();
  if (needle) {
    const digits = needle.replace(/\D/g, "");
    if (digits.length >= 4) {
      query = query.or(`nombre.ilike.%${needle}%,telefono.ilike.%${digits}%`);
    } else {
      query = query.ilike("nombre", `%${needle}%`);
    }
  }

  // Cola de acción: los que más esperan primero; tabla: recientes primero.
  if (onlyAction === "true") {
    query = query.order("last_customer_message_at", {
      ascending: true,
      nullsFirst: false,
    });
  } else {
    query = query
      .order("last_customer_message_at", { ascending: false, nullsFirst: true })
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
