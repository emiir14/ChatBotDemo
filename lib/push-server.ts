import webPush from "web-push";
import { getEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";

/** Payload mínimo: nada de contenido del chat ni datos sensibles. */
export interface PushPayload {
  title: string;
  body: string;
  /** Ruta a abrir al tocar la notificación (conversación). */
  url: string;
  /** Agrupa: mensajes del mismo chat reemplazan la notificación anterior. */
  tag?: string;
}

interface SubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let configured: boolean | null = null;

/** Configura VAPID una sola vez. Devuelve false si faltan claves (no rompe). */
function configureVapid(): boolean {
  if (configured !== null) return configured;
  try {
    const env = getEnv();
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
      configured = false;
      return false;
    }
    webPush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    configured = true;
  } catch {
    configured = false;
  }
  return configured;
}

/**
 * Envía el aviso a todos los dispositivos suscriptos.
 * Limpia suscripciones muertas: si el servicio de push responde 404/410,
 * borra esa fila de Supabase para no seguir reintentando.
 */
export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!configureVapid()) return;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth");
  if (error) {
    console.error(`[push] no se pudieron leer las suscripciones: ${error.message}`);
    return;
  }
  const subs = (data ?? []) as SubRow[];
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60 * 60, urgency: "high" },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          dead.push(sub.endpoint);
        } else {
          console.error(
            `[push] envío falló (${status ?? "?"}): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }),
  );

  if (dead.length > 0) {
    const { error: delError } = await supabase
      .from("push_subscriptions")
      .delete()
      .in("endpoint", dead);
    if (delError) {
      console.error(`[push] no se pudieron borrar ${dead.length} suscripciones muertas: ${delError.message}`);
    } else {
      console.log(`[push] eliminadas ${dead.length} suscripciones vencidas`);
    }
  }
}

/** Solo para tests: limpia la caché de configuración. */
export function __resetPushConfig(): void {
  configured = null;
}
