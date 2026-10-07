import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { buildActivity } from "@/lib/activity";

/** GET /api/dashboard/activity — últimos 12 eventos para el feed en vivo. */
export async function GET(): Promise<NextResponse> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messages")
    .select("id,rol,texto,created_at,lead_id,leads!inner(nombre,requiere_humano,first_message_at)")
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) {
    return NextResponse.json(
      { error: `No se pudo cargar la actividad: ${error.message}` },
      { status: 500 },
    );
  }
  const raw = (data ?? []) as unknown as Array<{
    id: string;
    rol: string;
    texto: string;
    created_at: string;
    lead_id: string;
    leads:
      | { nombre: string | null; requiere_humano: boolean; first_message_at: string }
      | Array<{ nombre: string | null; requiere_humano: boolean; first_message_at: string }>
      | null;
  }>;
  const rows = raw.map((m) => {
    const joined = Array.isArray(m.leads) ? (m.leads[0] ?? null) : m.leads;
    return {
      id: m.id,
      rol: m.rol,
      texto: m.texto,
      created_at: m.created_at,
      lead_id: m.lead_id,
      lead_nombre: joined?.nombre ?? null,
      lead_requiere: joined?.requiere_humano ?? false,
      lead_first: joined?.first_message_at ?? m.created_at,
    };
  });
  return NextResponse.json({ items: buildActivity(rows) });
}
