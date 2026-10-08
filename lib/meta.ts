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
 * Normaliza el destinatario solo para el envío a Meta.
 * Los números de prueba comparan el `to` exacto contra su lista permitida,
 * que registra los móviles argentinos SIN el 9 (549... → 54...).
 * En la base se sigue guardando el número original con 9.
 */
export function normalizeArPhone(phone: string): string {
  return /^549\d{10}$/.test(phone) ? "54" + phone.slice(3) : phone;
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

/**
 * Normalización aplicable al enviar: solo si NORMALIZE_AR_PHONE=true
 * (números de prueba con lista permitida sin el 9). Con número real,
 * ponerla en "false".
 */
export function normalizePhoneForMeta(phone: string): string {
  try {
    if (getEnv().NORMALIZE_AR_PHONE !== "true") return phone;
  } catch {
    return phone;
  }
  return normalizeArPhone(phone);
}

interface PostResult {
  ok: boolean;
  data: unknown;
  errorCode?: number;
  errorMessage?: string;
}

/** POST común a /messages con timeout y parseo de errores de Meta. */
async function postMessages(body: Record<string, unknown>): Promise<PostResult> {
  const { base, configured } = apiBase();
  if (!configured) {
    return {
      ok: false,
      data: null,
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
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      let code: number | undefined;
      let message = `Meta respondió ${res.status}`;
      if (isRecord(data) && isRecord(data.error)) {
        if (typeof data.error.code === "number") code = data.error.code;
        if (typeof data.error.message === "string") message = data.error.message;
      }
      return { ok: false, data, errorCode: code, errorMessage: message };
    }
    return { ok: true, data };
  } catch (err) {
    return {
      ok: false,
      data: null,
      errorMessage: err instanceof Error ? err.message : "Error de red con Meta.",
    };
  }
}

/** Envía un mensaje de texto. Maneja 131047 (ventana 24 h) sin romper. */
export async function sendWhatsAppText(args: {
  to: string;
  body: string;
}): Promise<SendResult> {
  const sent = await postMessages({
    messaging_product: "whatsapp",
    to: normalizePhoneForMeta(args.to),
    type: "text",
    text: { body: args.body },
  });
  if (!sent.ok) return sent;
  let metaId: string | undefined;
  if (isRecord(sent.data)) {
    const parsed = (sent.data as MetaSuccess).messages;
    if (Array.isArray(parsed) && typeof parsed[0]?.id === "string") {
      metaId = parsed[0].id;
    }
  }
  return { ok: true, metaMessageId: metaId };
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
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort: no rompe el flujo.
  }
}

/**
 * Arma el body de envío por plantilla aprobada (sirve fuera de la ventana
 * de 24 hs). La hello_world es la plantilla de prueba que trae Meta.
 */
export function buildTemplateBody(args: {
  to: string;
  name?: string;
  language?: string;
}): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    to: normalizePhoneForMeta(args.to),
    type: "template",
    template: {
      name: args.name ?? "hello_world",
      language: { code: args.language ?? "en_US" },
    },
  };
}

/** Envía una plantilla aprobada (p. ej. para el botón "Enviarme WhatsApp"). */
export async function sendWhatsAppTemplate(args: {
  to: string;
  name?: string;
  language?: string;
}): Promise<SendResult> {
  const sent = await postMessages(buildTemplateBody(args));
  if (!sent.ok) {
    return { ok: false, errorCode: sent.errorCode, errorMessage: sent.errorMessage };
  }
  return { ok: true };
}
