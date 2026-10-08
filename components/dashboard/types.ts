/** Tipos compartidos del panel (lo que devuelven las APIs). */

export type Temperatura = "caliente" | "tibio" | "frio";
export type LeadEstado = "nuevo" | "en_conversacion" | "derivado" | "recontactado";

export interface Variation {
  pct: number;
  up: boolean;
}

export interface SummaryResponse {
  period: string;
  site: { name: string; humanReplyReference: string };
  hasDemoData: boolean;
  demoMode: boolean;
  metrics: {
    hoy: { value: number };
    atendidas: { value: number; variation: Variation | null };
    primeraRespuestaSeg: { value: number | null; variation: null };
    fueraHorario: { value: number; variation: Variation | null };
    calientes: { value: number; variation: Variation | null };
    tasaCalificacion: { value: number; variation: null };
    mensajes: { value: number };
    derivados: { value: number; variation: Variation | null };
  };
  funnel: Array<{
    key: string;
    label: string;
    value: number;
    conversionFromPrev: number | null;
  }>;
  heatmap: Array<{ dow: number; hour: number; n: number }>;
  daily: Array<{ day: string; n: number }>;
  modelsVsStock: Array<{ modelo: string; consultas: number; stock: number }>;
  insights: Array<{ text: string }>;
  actionCount: number;
  stock: {
    updatedAt: string | null;
    staleDays: number;
    daysSinceUpdate: number | null;
    isStale: boolean;
  };
}

export interface LeadRow {
  id: string;
  telefono: string;
  nombre: string | null;
  auto_interes: string | null;
  presupuesto: string | null;
  permuta: string | null;
  temperatura: Temperatura | null;
  requiere_humano: boolean;
  estado: LeadEstado;
  origen_demo: boolean;
  atendido_at: string | null;
  last_customer_message_at: string | null;
  created_at: string;
}

export interface LeadsResponse {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface LeadDetail {
  id: string;
  telefono: string;
  nombre: string | null;
  auto_interes: string | null;
  presupuesto: string | null;
  permuta: string | null;
  financiacion: boolean | null;
  urgencia: string | null;
  temperatura: Temperatura | null;
  requiere_humano: boolean;
  resumen: string | null;
  estado: LeadEstado;
  origen_demo: boolean;
  atendido_at: string | null;
  atendido_por: string | null;
  first_message_at: string | null;
  last_customer_message_at: string | null;
  last_bot_reply_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  rol: "cliente" | "bot" | "sistema";
  texto: string;
  /** Null = Meta lo rechazó (el panel lo muestra, pero no llegó). */
  wa_message_id?: string | null;
  created_at: string;
}

export interface StatusResponse {
  leadsTotal: number;
  lastChange: string | null;
  actionCount: number;
}
