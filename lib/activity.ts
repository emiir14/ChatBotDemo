/**
 * Feed de actividad: últimos mensajes con contexto del lead.
 * Lógica pura testeable + fetcher para la API.
 */

export interface ActivityItem {
  id: string;
  kind: "nuevo_lead" | "mensaje_cliente" | "respuesta_bot" | "derivado";
  text: string;
  at: string;
  leadId: string;
  leadName: string | null;
}

interface RawMessage {
  id: string;
  rol: string;
  texto: string;
  created_at: string;
  lead_id: string;
  lead_nombre: string | null;
  lead_requiere: boolean;
  lead_first: string;
}

/** Convierte filas crudas en items legibles para el dueño. */
export function buildActivity(rows: RawMessage[]): ActivityItem[] {
  return rows.map((m) => {
    const name = m.lead_nombre ?? "Sin nombre";
    const first = Math.abs(new Date(m.created_at).getTime() - new Date(m.lead_first).getTime()) < 90_000;
    if (m.rol === "cliente" && first) {
      return { id: m.id, kind: "nuevo_lead", text: `Nuevo lead: ${name}`, at: m.created_at, leadId: m.lead_id, leadName: m.lead_nombre };
    }
    if (m.rol === "cliente") {
      return { id: m.id, kind: "mensaje_cliente", text: `${name} escribió`, at: m.created_at, leadId: m.lead_id, leadName: m.lead_nombre };
    }
    if (m.lead_requiere) {
      return { id: m.id, kind: "derivado", text: `${name} pidió un asesor`, at: m.created_at, leadId: m.lead_id, leadName: m.lead_nombre };
    }
    return { id: m.id, kind: "respuesta_bot", text: `Bot respondió a ${name}`, at: m.created_at, leadId: m.lead_id, leadName: m.lead_nombre };
  });
}
