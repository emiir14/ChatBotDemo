/** Tipos compartidos del panel (lo que devuelven las APIs). */

export type Temperatura = "caliente" | "tibio" | "frio";
export type LeadEstado = "nuevo" | "en_conversacion" | "derivado" | "recontactado";

/** Variación respecto al período anterior (null = sin datos previos). */
export interface Variation {
  pct: number;
  up: boolean;
}

export interface SummaryResponse {
  period: string;
  periodLabel: string;
  site: { name: string; humanReplyReference: string };
  hasDemoData: boolean;
  demoMode: boolean;
  metrics: {
    consultas: { value: number; delta: Variation | null };
    atendidas: { value: number; delta: Variation | null };
    primeraRespuestaSeg: { value: number | null };
    fueraHorario: { value: number; delta: Variation | null };
    calientes: { value: number; delta: Variation | null };
    derivados: { value: number; delta: Variation | null };
  };
  funnel: Array<{
    key: string;
    label: string;
    value: number;
    conversionFromPrev: number | null;
  }>;
  heatmap: Array<{ dow: number; hour: number; n: number }>;
  daily: Array<{ day: string; n: number }>;
  tempDist: Array<{ key: Temperatura; n: number }>;
  estadoDist: Array<{ key: LeadEstado; n: number }>;
  firstResponse: {
    buckets: Array<{ label: string; n: number }>;
    withinSla: number;
    total: number;
    slaSeconds: number;
  };
  businessHours: { dentro: number; fuera: number; total: number };
  recontact: { total: number; bot: number; agente: number; respondieron: number };
  modelsStages: Array<{
    modelo: string;
    consultas: number;
    calificados: number;
    calientes: number;
    derivados: number;
  }>;
  priceDemand: Array<{ bucket: string; consultas: number; stock: number }>;
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
  atendido_por: string | null;
  /** Timestamp del recontacto hecho por un agente (botón WhatsApp). */
  recontactado_agente_at: string | null;
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
  recontactado_agente_at: string | null;
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
