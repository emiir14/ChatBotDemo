import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Utilidades puras del webhook de WhatsApp (testeables, sin I/O).
 * El envío real a la API de Meta vive en lib/meta.ts.
 */

// ---------------------------------------------------------------------------
// 1. Validación de firma X-Hub-Signature-256
// ---------------------------------------------------------------------------

export function verifyMetaSignature(args: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = args;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const hex = signatureHeader.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return false;
  const expected = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  const a = Buffer.from(hex.toLowerCase(), "utf8");
  const b = Buffer.from(expected.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Firma un body (lo que hace scripts/simular.ts para imitar a Meta). */
export function signBody(rawBody: string, appSecret: string): string {
  const hex = createHmac("sha256", appSecret)
    .update(rawBody, "utf8")
    .digest("hex");
  return `sha256=${hex}`;
}

// ---------------------------------------------------------------------------
// 2. Parseo tolerante del payload de Meta
// ---------------------------------------------------------------------------

const metaMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: z.object({ body: z.string() }).optional(),
});

const changeValueSchema = z.object({
  messages: z.array(metaMessageSchema).optional(),
  contacts: z
    .array(
      z.object({
        profile: z.object({ name: z.string() }).partial().optional(),
        wa_id: z.string().optional(),
      }),
    )
    .optional(),
});

const changeSchema = z.object({
  field: z.string().optional(),
  value: changeValueSchema.optional(),
});

const entrySchema = z.object({
  changes: z.array(changeSchema).optional(),
});

const webhookSchema = z.object({
  object: z.string().optional(),
  entry: z.array(entrySchema).optional(),
});

export interface IncomingMessage {
  from: string;
  waId: string;
  receivedAt: Date;
  kind: "text" | "other";
  /** Tipo Meta cuando no es texto (audio, image, sticker, location, ...). */
  otherType?: string;
  body: string;
  senderName?: string;
}

/**
 * Extrae los mensajes entrantes del payload. Las notificaciones de estado
 * (sent/delivered/read) y los eventos sin `messages` devuelven [].
 * Nunca lanza: ante payload inválido devuelve [].
 */
export function extractIncomingMessages(payload: unknown): IncomingMessage[] {
  const parsed = webhookSchema.safeParse(payload);
  if (!parsed.success) return [];
  const out: IncomingMessage[] = [];
  for (const entry of parsed.data.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const names = new Map<string, string>();
      for (const c of value.contacts ?? []) {
        if (c.wa_id && c.profile?.name) names.set(c.wa_id, c.profile.name);
      }
      for (const m of value.messages ?? []) {
        const receivedAt = new Date(Number(m.timestamp) * 1000);
        if (m.type === "text" && m.text) {
          out.push({
            from: m.from,
            waId: m.id,
            receivedAt: Number.isNaN(receivedAt.getTime())
              ? new Date()
              : receivedAt,
            kind: "text",
            body: m.text.body,
            senderName: names.get(m.from),
          });
        } else {
          out.push({
            from: m.from,
            waId: m.id,
            receivedAt: Number.isNaN(receivedAt.getTime())
              ? new Date()
              : receivedAt,
            kind: "other",
            otherType: m.type,
            body: `[mensaje no textual: ${m.type}]`,
            senderName: names.get(m.from),
          });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. Ayudas varias
// ---------------------------------------------------------------------------

/** Comando "reiniciar demo" (exacto, sin importar mayúsculas ni espacios). */
export function isRestartCommand(text: string): boolean {
  return text.trim().toLowerCase() === "reiniciar demo";
}

/**
 * ¿Procesar "reiniciar demo"? Solo si es mensaje de texto, coincide el
 * comando exacto Y está activo DEMO_MODE (en producción es "false" y el
 * texto se trata como un mensaje normal).
 */
export function shouldHandleRestart(args: {
  text: string;
  kind: "text" | "other";
  demoMode: boolean;
}): boolean {
  return (
    args.kind === "text" && args.demoMode && isRestartCommand(args.text)
  );
}

/** Enmascara un teléfono para logs (sin datos sensibles): "...0101". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `...${digits.slice(-4)}`;
}

/** Verificación GET de Meta: compara el verify token. */
export function isValidVerifyRequest(args: {
  mode: string | null;
  token: string | null;
  expectedToken: string | undefined;
}): boolean {
  const { mode, token, expectedToken } = args;
  if (!expectedToken) return false;
  return mode === "subscribe" && token === expectedToken;
}
