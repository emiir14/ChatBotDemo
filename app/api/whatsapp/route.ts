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
  BotUnavailableError,
  busyReply,
  fallbackReply,
  generateBotReply,
  isGeminiQuotaError,
  technicalErrorReply,
} from "@/lib/bot";
import { activeFinancing, todayCordoba, type FinancingOption } from "@/lib/financing";
import { consumeRateLimit } from "@/lib/rate-limit";
import { sendPushToAll } from "@/lib/push-server";
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
  // Los POST de estado (entregado/leído) no traen mensajes: no ensucian el log.
  if (incoming.length > 0) {
    console.log(`[whatsapp] POST recibido, mensajes extraídos: ${incoming.length}`);
  }

  // 200 inmediato para que Meta no reintente. El after() DEVUELVE las
  // promesas: si el callback fuera sincrónico, Vercel congelaría la función
  // al responder y el trabajo en background moriría a medias.
  after(async () => {
    await Promise.all(
      incoming.map((msg) => chainFor(msg.from, () => handleIncoming(msg))),
    );
  });

  return NextResponse.json({ ok: true });
}

// ---------------------------------------------------------------------------
// Procesamiento en orden por teléfono (una cadena de promesas por número)
// ---------------------------------------------------------------------------

const chains = new Map<string, Promise<void>>();

function chainFor(phone: string, job: () => Promise<void>): Promise<void> {
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
  return next;
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

  // Motivo del aviso push (si corresponde): intervención humana o lead caliente.
  let pushReason: "intervencion" | "caliente" | null = null;
  let pushInteres = lead.auto_interes;

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

  // 8. Cerebro: stock + últimos mensajes + datos del lead (en paralelo).
  // El mensaje entrante ya se guardó en el paso 4, así que se excluye del
  // historial por su wa_id: si no, Gemini lo leería dos veces.
  const [{ data: stock }, { data: stockSettings }, { data: history }, { data: financing }] =
    await Promise.all([
      supabase
        .from("vehicles")
        .select("marca,modelo,version,anio,es_0km,km,precio,moneda,combustible,transmision,color,descripcion")
        .eq("estado", "disponible")
        .order("marca")
        .order("modelo"),
      supabase.from("stock_settings").select("updated_at").eq("id", 1).maybeSingle(),
      supabase
        .from("messages")
        .select("rol, texto, wa_message_id")
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(11),
      supabase.from("financing_options").select("*").eq("activo", true),
    ]);

  const historyAsc = (
    (history as Array<{ rol: string; texto: string; wa_message_id: string | null }> | null) ?? []
  )
    .reverse()
    .filter((m) => m.wa_message_id !== msg.waId)
    .slice(-10)
    .map(({ rol, texto }) => ({ rol, texto }));

  let reply: string;
  let needsHuman = false;
  try {
    const result = await generateBotReply({
      lead,
      history: historyAsc,
      vehicles: (stock ?? []) as Vehicle[],
      newMessage: msg.body,
      stockUpdatedAt: (stockSettings as { updated_at?: string } | null)?.updated_at ?? null,
      financing: activeFinancing(
        ((financing ?? []) as FinancingOption[]),
        todayCordoba(),
      ),
    });
    reply = result.reply;
    if (result.leadUpdate) {
      const patch: Record<string, string | boolean | null> = {};
      for (const [key, value] of Object.entries(result.leadUpdate)) {
        // != null: si el modelo devuelve null no pisa un dato ya conocido.
        if (value != null) patch[key] = value as string | boolean;
      }
      if (result.leadUpdate.requiere_humano === true) {
        patch.estado = "derivado";
        needsHuman = true;
        if (!lead.requiere_humano) pushReason = "intervencion";
      } else if (lead.estado === "nuevo") {
        patch.estado = "en_conversacion";
      }
      if (typeof patch.auto_interes === "string") pushInteres = patch.auto_interes;
      if (!pushReason && patch.temperatura === "caliente" && lead.temperatura !== "caliente") {
        pushReason = "caliente";
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
    if (err instanceof BotUnavailableError || isGeminiQuotaError(err)) {
      // Todos los modelos caídos/saturados o sin cuota: pedir paciencia SIN
      // derivar (no es un problema del negocio, es infra de la IA).
      reply = busyReply();
    } else {
      reply = technicalErrorReply();
      needsHuman = true;
      if (!lead.requiere_humano && !pushReason) pushReason = "intervencion";
      await supabase
        .from("leads")
        .update({ requiere_humano: true, estado: "derivado" })
        .eq("id", lead.id);
    }
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

  // 10. Aviso push (payload mínimo, sin contenido del chat). Ya estamos dentro
  // del after(): no demora la respuesta a Meta ni alarga la ejecución.
  if (pushReason) {
    const nombre = lead.nombre ?? "Sin nombre";
    await sendPushToAll({
      title: pushReason === "intervencion" ? "Un chat necesita un vendedor" : "Lead caliente",
      body: pushInteres ? `${nombre} · ${pushInteres}` : nombre,
      url: `/dashboard?lead=${lead.id}`,
      tag: lead.id,
    });
  }
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
