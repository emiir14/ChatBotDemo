/**
 * Utilidades de fecha/hora puras (testeables, sin dependencias).
 * Zona horaria del negocio: America/Argentina/Cordoba (UTC-3, sin DST).
 */

export const BUSINESS_TIME_ZONE = "America/Argentina/Cordoba";

/** Ventana gratuita de WhatsApp: 24 h desde el último mensaje del cliente. */
export const WHATSAPP_FREE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * ¿Se puede enviar un mensaje libre (no plantilla) al lead?
 * Solo si last_customer_message_at está dentro de las últimas 24 h.
 */
export function isWithin24hWindow(
  lastCustomerMessageAt: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!lastCustomerMessageAt) return false;
  const last = new Date(lastCustomerMessageAt).getTime();
  if (Number.isNaN(last)) return false;
  const diff = now.getTime() - last;
  return diff >= 0 && diff < WHATSAPP_FREE_WINDOW_MS;
}

// Horario comercial por defecto: lun-vie 9-18, sáb 9-13 (Etapa 3 lo hará
// configurable; por ahora es una constante documentada).
export interface BusinessHours {
  /** Días 1-5 (lun-vie): [apertura, cierre] en hora local. */
  weekday: [number, number];
  /** Sábado: [apertura, cierre] en hora local. Domingo: cerrado. */
  saturday: [number, number];
}

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  weekday: [9, 18],
  saturday: [9, 13],
};

function getLocalParts(date: Date): { weekday: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date);
  const dayStr = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // Intl puede devolver "24" para la medianoche en hour12:false.
  const hour = Number(hourStr) % 24;
  return { weekday: dayMap[dayStr] ?? 1, hour };
}

/**
 * ¿La fecha cae fuera del horario comercial? (para la métrica
 * "consultas fuera de horario" del panel).
 */
export function isOutsideBusinessHours(
  date: string | Date,
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
): boolean {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const { weekday, hour } = getLocalParts(d);
  if (weekday === 0) return true; // domingo: cerrado
  if (weekday === 6) {
    const [open, close] = hours.saturday;
    return hour < open || hour >= close;
  }
  const [open, close] = hours.weekday;
  return hour < open || hour >= close;
}

/** ¿El local está abierto en este momento? (inverso de isOutsideBusinessHours). */
export function isOpenNow(
  date: string | Date = new Date(),
  hours: BusinessHours = DEFAULT_BUSINESS_HOURS,
): boolean {
  return !isOutsideBusinessHours(date, hours);
}

/**
 * Fecha y hora actual formateadas en español para inyectar al bot como DATO,
 * siempre en America/Argentina/Cordoba (el servidor corre en UTC y de noche
 * el día UTC puede diferir del día en Córdoba).
 * Ej: "martes 6 de octubre de 2026, 23:30 (hora de Córdoba)".
 */
export function formatCordobaDateTime(date: string | Date = new Date()): string {
  const d = new Date(date);
  const fecha = new Intl.DateTimeFormat("es-AR", {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone: BUSINESS_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${fecha}, ${hora} (hora de Córdoba)`;
}
