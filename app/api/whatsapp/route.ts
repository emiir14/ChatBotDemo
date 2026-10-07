import { after } from "next/server";
import { NextResponse } from "next/server";
import { getEnv, isDemoMode } from "@/lib/env";
import {
  extractIncomingMessages,
  isValidVerifyRequest,
  maskPhone,
  shouldHandleRestart,
  verifyMetaSignature,
  type IncomingMessage,
} from "@/lib/whatsapp";
import { markAsRead, sendWhatsAppText } from "@/lib/meta";
import {
  fallbackReply,
  generateBotReply,
  technicalErrorReply,
} from "@/lib/bot";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getSupabaseAdmin, type Lead, type Vehicle } from "@/lib/supabase";

/**
 * Webhook de WhatsApp Cloud API.
 * GET = verificación de Meta. POST = mensajes entrantes (200 inmediato +
 * procesamiento en segundo plano con after()).
 */

// La demo corre en Vercel Hobby ($0): tope permitido para la función.
export const maxDuration = 60;

// ---------------------------------------------------------------------------
// GET: verificación del webhook
// ---------------------------------------------------------------------------
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  let expected: string | undefined;
  try {
    expected = getEnv().WHATSAPP_VERIFY_TOKEN;
  } catch {
    expected = undefined;
  }
  if (isValidVerifyRequest({ mode, token, expectedToken: expected })) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("Forbidden", { status: 403 });
}

// ---------------------------------------------------------------------------
// POST: mensajes entrantes
// ---------------------------------------------------------------------------
export async function POST(req: Request): Promise<Response> {
  let appSecret: string | undefined;
  try {
    appSecret = getEnv().META_APP_SECRET;
  } catch {
    appSecret = undefined;
  }
  if (!appSecret) {
    console.error("[whatsapp] META_APP_SECRET no configurado.");
    return new Response("Webhook no configurado", { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature({ rawBody, signatureHeader: signature, appSecret })) {
    return new Response("Firma inválida", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  const incoming = extractIncomingMessages(payload);

  // 200 inmediato para que Meta no reintente; el trabajo sigue en background.
  after(() => {
    for (const msg of incoming) {
      chainFor(msg.from, () => handleIncoming(msg));
    }
  });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Procesamiento en orden por teléfono (una cadena de promesas por número)
// ---------------------------------------------------------------------------

const chains = new Map<string, Promise<void>>();

function chainFor(phone: string, job: () => Promise<void>): void {
  const prev = chains.get(phone) ?? Promise.resolve();
  const next = prev
    .catch(() => undefined)
    .then(job)
    .catch((err) => {
      console.error(
        `[whatsapp] error no capturado para ${maskPhone(phone)}:`,
        err instanceof Error ? err.message : String(err),
      );
    });
  chains.set(phone, next);
  void next.finally(() => {
    if (chains.get(phone) === next) chains.delete(phone);
  });
}

// ---------------------------------------------------------------------------
// Pipeline de un mensaje
// ---------------------------------------------------------------------------

function supabaseErrorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

async function handleIncoming(msg: IncomingMessage): Promise<void> {
  const supabase = getSupabaseAdmin();
  const masked = maskPhone(msg.from);

  // 1. Deduplicación atómica (Meta puede reenviar el evento).
  const { error: dedupError } = await supabase
    .from("processed_events")
    .insert({ wa_message_id: msg.waId });
  if (dedupError) {
    if (supabaseErrorCode(dedupError) === "23505") {
      console.log(`[whatsapp] duplicado ignorado waId=${msg.waId} de ${masked}`);
      return;
    }
    console.error(`[whatsapp] dedup falló (${masked}): ${dedupError.message}`);
    // Se sigue igual: mejor un posible duplicado que un mensaje perdido.
  }

  // 2. Marcar como leído (best effort, no bloquea).
  await markAsRead(msg.waId);

  // 3. Buscar o crear el lead.
  let lead: Lead | null = null;
  const { data: existing } = await supabase
    .from("leads")
    .select("*")
    .eq("telefono", msg.from)
    .maybeSingle();
  lead = (existing as Lead | null) ?? null;

  const nowIso = new Date().toISOString();
  if (!lead) {
    const { data: created, error } = await supabase
      .from("leads")
      .insert({
        telefono: msg.from,
        nombre: msg.senderName ?? null,
        estado: "nuevo",
        first_message_at: nowIso,
      })
      .select("*")
      .single();
    if (error || !created) {
      console.error(`[whatsapp] no se pudo crear lead (${masked}): ${error?.message}`);
      return;
    }
    lead = created as Lead;
  }

  // 4. Guardar el mensaje entrante y actualizar actividad.
  await supabase.from("messages").insert({
    lead_id: lead.id,
    rol: "cliente",
    texto: msg.body,
    wa_message_id: msg.waId,
  });
  await supabase
    .from("leads")
    .update({ last_customer_message_at: nowIso })
    .eq("id", lead.id);

  // 5. Comando especial de demo (antes del rate limit: es control, no charla).
  // Solo con DEMO_MODE=true; si no, se procesa como mensaje normal.
  if (
    shouldHandleRestart({
      text: msg.body,
      kind: msg.kind,
      demoMode: isDemoMode(getEnv()),
    })
  ) {
    await supabase.from("leads").delete().eq("id", lead.id);
    const confirm =
      "Listo, reinicié la conversación y borré tu historial. ¿En qué auto estás interesado?";
    const sent = await sendWhatsAppText({ to: msg.from, body: confirm });
    console.log(
      `[whatsapp] demo reiniciada para ${masked} (envío ${sent.ok ? "ok" : "falló"})`,
    );
    return;
  }

  // 6. Rate limit (20/hora por teléfono).
  if (!consumeRateLimit(msg.from)) {
    const aviso =
      "Estoy recibiendo muchos mensajes juntos, dame un minutito y seguimos.";
    const sent = await sendWhatsAppText({ to: msg.from, body: aviso });
    await saveBotMessage(lead.id, aviso, sent.metaMessageId);
    console.log(`[whatsapp] rate limit para ${masked}`);
    return;
  }

  // 7. Mensajes no textuales: respuesta amable sin llamar a Gemini.
  if (msg.kind !== "text") {
    const aviso =
      "Por ahora solo puedo leer mensajes de texto. Escribime con palabras lo que necesitás y te ayudo con los autos.";
    const sent = await sendWhatsAppText({ to: msg.from, body: aviso });
    await saveBotMessage(lead.id, aviso, sent.metaMessageId);
    console.log(`[whatsapp] no-textual (${msg.otherType}) de ${masked}`);
    return;
  }

  // 8. Cerebro: stock + últimos 10 mensajes + datos del lead.
  const { data: stock } = await supabase
    .from("vehicles")
    .select("*")
    .eq("estado", "disponible")
    .order("marca")
    .order("modelo");
  const { data: history } = await supabase
    .from("messages")
    .select("rol, texto")
    .eq("lead_id", lead.id)
    .order("created_at", { ascending: false })
    .limit(10);

  const historyAsc =
    (history as Array<{ rol: string; texto: string }> | null) ?? [];
  historyAsc.reverse();

  let reply: string;
  let needsHuman = false;
  try {
    const result = await generateBotReply({
      lead,
      history: historyAsc,
      vehicles: (stock ?? []) as Vehicle[],
      newMessage: msg.body,
    });
    reply = result.reply;
    if (result.leadUpdate) {
      const patch: Record<string, string | boolean | null> = {};
      for (const [key, value] of Object.entries(result.leadUpdate)) {
        if (value !== undefined) patch[key] = value as string | boolean;
      }
      if (result.leadUpdate.requiere_humano === true) {
        patch.estado = "derivado";
        needsHuman = true;
      } else if (lead.estado === "nuevo") {
        patch.estado = "en_conversacion";
      }
      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from("leads")
          .update(patch)
          .eq("id", lead.id);
        if (error) {
          console.error(`[whatsapp] no se pudo actualizar lead (${masked}): ${error.message}`);
        }
      }
    } else if (lead.estado === "nuevo") {
      await supabase
        .from("leads")
        .update({ estado: "en_conversacion" })
        .eq("id", lead.id);
    }
  } catch (err) {
    console.error(
      `[whatsapp] Gemini falló (${masked}): ${err instanceof Error ? err.message : String(err)}`,
    );
    reply = technicalErrorReply();
    needsHuman = true;
    await supabase
      .from("leads")
      .update({ requiere_humano: true })
      .eq("id", lead.id);
    // Si ni el fallback genérico aplica (acá siempre hay reply), igual
    // garantizamos respuesta. fallbackReply se usa si el modelo devolvió
    // vacío en un caso borde ya cubierto por el schema (min 1).
    if (!reply) reply = fallbackReply(getEnv().DEALERSHIP_NAME);
  }

  // 9. Enviar y guardar (el cliente NUNCA se queda sin respuesta).
  const sent = await sendWhatsAppText({ to: msg.from, body: reply });
  if (!sent.ok) {
    if (sent.errorCode === 131047) {
      console.warn(
        `[whatsapp] ventana 24 h vencida para ${masked}: no se pudo enviar.`,
      );
    } else {
      console.error(`[whatsapp] envío falló (${masked}): ${sent.errorMessage}`);
    }
  }
  await saveBotMessage(lead.id, reply, sent.metaMessageId);
  console.log(
    `[whatsapp] respuesta ${sent.ok ? "enviada" : "NO enviada"} a ${masked}${needsHuman ? " (derivado a humano)" : ""}`,
  );
}

async function saveBotMessage(
  leadId: string,
  texto: string,
  waMessageId: string | undefined,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  await supabase.from("messages").insert({
    lead_id: leadId,
    rol: "bot",
    texto,
    wa_message_id: waMessageId ?? null,
  });
  await supabase
    .from("leads")
    .update({ last_bot_reply_at: new Date().toISOString() })
    .eq("id", leadId);
}
