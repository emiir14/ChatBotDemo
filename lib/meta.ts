import { getEnv } from "@/lib/env";

/**
 * Llamadas a WhatsApp Cloud API (Graph API de Meta).
 * Toda función es defensiva: nunca lanza, siempre devuelve un resultado.
 */

export interface SendResult {
  ok: boolean;
  metaMessageId?: string;
  /** Código de error de Meta (ej. 131047 = ventana de 24 h vencida). */
  errorCode?: number;
  errorMessage?: string;
}

interface MetaSuccess {
  messages?: Array<{ id?: string }>;
}

interface MetaErrorBody {
  error?: { code?: number; message?: string };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Arma el body de "marcar como leído + mostrar escribiendo".
 * Documentación oficial de Meta ("Typing indicators", verificada oct 2026):
 * es el MISMO endpoint de mensajes con status=read más el parámetro
 * typing_indicator. El indicador se apaga al responder o a los 25 s.
 */
export function buildReadReceiptBody(messageId: string): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: messageId,
    typing_indicator: { type: "text" },
  };
}

/** Base de la API + si está configurada (token y phone number id). */
function apiBase(): { base: string; configured: boolean } {
  const env = getEnv();
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    return { base: "", configured: false };
  }
  return {
    base: `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}`,
    configured: true,
  };
}

/** Envía un mensaje de texto. Maneja 131047 (ventana 24 h) sin romper. */
export async function sendWhatsAppText(args: {
  to: string;
  body: string;
}): Promise<SendResult> {
  const { base, configured } = apiBase();
  if (!configured) {
    return {
      ok: false,
      errorMessage: "WhatsApp no configurado (falta TOKEN o PHONE_NUMBER_ID).",
    };
  }
  try {
    const res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getEnv().WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: args.to,
        type: "text",
        text: { body: args.body },
      }),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      let code: number | undefined;
      let message = `Meta respondió ${res.status}`;
      if (isRecord(data) && isRecord(data.error)) {
        if (typeof data.error.code === "number") code = data.error.code;
        if (typeof data.error.message === "string") message = data.error.message;
      }
      return { ok: false, errorCode: code, errorMessage: message };
    }
    let metaId: string | undefined;
    if (isRecord(data)) {
      const parsed = (data as MetaSuccess).messages;
      if (Array.isArray(parsed) && typeof parsed[0]?.id === "string") {
        metaId = parsed[0].id;
      }
    }
    return { ok: true, metaMessageId: metaId };
  } catch (err) {
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : "Error de red con Meta.",
    };
  }
}

/**
 * Marca un mensaje como leído y muestra "escribiendo…" (best effort: los
 * errores solo se ignoran, nunca rompen el flujo). Solo se llama cuando se
 * va a responder, como pide Meta.
 */
export async function markAsRead(messageId: string): Promise<void> {
  const { base, configured } = apiBase();
  if (!configured) return;
  try {
    await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getEnv().WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(buildReadReceiptBody(messageId)),
    });
  } catch {
    // Best effort: no rompe el flujo.
  }
}
