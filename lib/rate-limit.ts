/**
 * Limitador simple por teléfono: máximo 20 mensajes por hora.
 * Es en memoria (se reinicia con cada deploy/reinicio). En Vercel serverless
 * puede haber más de una instancia en paralelo, así que es una protección
 * aproximada contra abusos, suficiente para la demo (no un rate-limit
 * distribuido).
 */

export const RATE_LIMIT_MAX_MESSAGES = 20;
export const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

const hits = new Map<string, number[]>();

function prune(phone: string, now: number): number[] {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  const kept = (hits.get(phone) ?? []).filter((t) => t > cutoff);
  hits.set(phone, kept);
  return kept;
}

/**
 * Registra un mensaje y dice si está permitido. Devuelve false cuando el
 * teléfono ya superó el máximo en la última hora (sin registrar de más).
 */
export function consumeRateLimit(phone: string, now: number = Date.now()): boolean {
  const kept = prune(phone, now);
  if (kept.length >= RATE_LIMIT_MAX_MESSAGES) return false;
  kept.push(now);
  hits.set(phone, kept);
  return true;
}

/** Solo para tests: limpia el estado en memoria. */
export function __clearRateLimits(): void {
  hits.clear();
}
