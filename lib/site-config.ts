import { getEnv } from "@/lib/env";
import {
  BUSINESS_TIME_ZONE,
  DEFAULT_BUSINESS_HOURS,
  type BusinessHours,
} from "@/lib/time";

/**
 * Configuración central de la concesionaria. TODO lo específico del cliente
 * (nombre, horarios, textos, referencia de respuesta humana) sale de acá,
 * que a su vez lee variables de entorno. Nada hardcodeado en componentes.
 */

export interface SiteConfig {
  name: string;
  address: string;
  hoursLabel: string;
  hours: BusinessHours;
  /** Referencia editable: cuánto tarda típicamente un humano (etiqueta). */
  humanReplyReferenceLabel: string;
  timeZone: string;
}

export function getSiteConfig(): SiteConfig {
  const env = getEnv();
  return {
    name: env.DEALERSHIP_NAME,
    address: env.DEALERSHIP_ADDRESS,
    hoursLabel: env.DEALERSHIP_HOURS,
    // El horario estructurado usa el default (lun-vie 9-18, sáb 9-13).
    // Si un cliente necesita otro, se agrega DEALERSHIP_HOURS_JSON.
    hours: DEFAULT_BUSINESS_HOURS,
    humanReplyReferenceLabel: "respuesta humana típica: 2 h",
    timeZone: BUSINESS_TIME_ZONE,
  };
}
