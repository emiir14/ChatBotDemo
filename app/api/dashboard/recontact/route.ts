import { NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getEnv, isDemoMode } from "@/lib/env";
import { getSupabaseAdmin, type Lead } from "@/lib/supabase";
import { isWithin24hWindow } from "@/lib/time";
import { sendWhatsAppText } from "@/lib/meta";
import { WINDOW_EXPIRED_MESSAGE } from "@/components/dashboard/window-message";

const draftSchema = z.object({ leadId: z.string().uuid(), step: z.literal("draft") });
const sendSchema = z.object({
  leadId: z.string().uuid(),
  step: z.literal("send"),
  text: z.string().min(1).max(1000),
});

/**
 * POST /api/dashboard/recontact
 * - { leadId, step: "draft" } → la IA genera un seguimiento (editable).
 * - { leadId, step: "send", text } → envía. Si el lead es demo
 *   (origen_demo = true) se SIMULA: se guarda en messages y NUNCA se llama
 *   a Meta. Si es real y venció la ventana de 24 hs, se rechaza.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const step = (body as { step?: unknown })?.step;
  const supabase = getSupabaseAdmin();

  if (step === "draft") {
    const parsed = draftSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", parsed.data.leadId)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    const draft = await generateDraft(lead as Lead);
    return NextResponse.json({ draft });
  }

  if (step === "send") {
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", parsed.data.leadId)
      .maybeSingle();
    if (!lead) return NextResponse.json({ error: "Lead no encontrado" }, { status: 404 });
    const leadRow = lead as Lead;
    const text = parsed.data.text.trim();

    // Leads demo: SIMULACIÓN. Nunca tocar la API de Meta (esos teléfonos
    // podrían pertenecer a personas reales).
    if (leadRow.origen_demo || isDemoMode(getEnv())) {
      await supabase.from("messages").insert({
        lead_id: leadRow.id,
        rol: "bot",
        texto: text,
        wa_message_id: `demo-sim-${Date.now()}`,
      });
      await supabase
        .from("leads")
        .update({
          last_bot_reply_at: new Date().toISOString(),
          estado: "recontactado",
        })
        .eq("id", leadRow.id);
      return NextResponse.json({ ok: true, simulated: true });
    }

    if (!isWithin24hWindow(leadRow.last_customer_message_at)) {
      return NextResponse.json(
        { ok: false, windowExpired: true, message: WINDOW_EXPIRED_MESSAGE },
        { status: 403 },
      );
    }
    const sent = await sendWhatsAppText({ to: leadRow.telefono, body: text });
    if (!sent.ok && sent.errorCode === 131047) {
      return NextResponse.json(
        { ok: false, windowExpired: true, message: WINDOW_EXPIRED_MESSAGE },
        { status: 403 },
      );
    }
    if (!sent.ok) {
      return NextResponse.json(
        { error: `No se pudo enviar: ${sent.errorMessage}` },
        { status: 502 },
      );
    }
    await supabase.from("messages").insert({
      lead_id: leadRow.id,
      rol: "bot",
      texto: text,
      wa_message_id: sent.metaMessageId ?? null,
    });
    await supabase
      .from("leads")
      .update({ last_bot_reply_at: new Date().toISOString(), estado: "recontactado" })
      .eq("id", leadRow.id);
    return NextResponse.json({ ok: true, simulated: false });
  }

  return NextResponse.json({ error: "step inválido" }, { status: 400 });
}

async function generateDraft(lead: Lead): Promise<string> {
  const env = getEnv();
  const fallback =
    `Hola${lead.nombre ? ` ${lead.nombre.split(" ")[0]}` : ""}! ` +
    `Te escribo de la concesionaria porque consultaste por ${lead.auto_interes ?? "un auto"}. ` +
    `¿Seguís interesado? Te puedo pasar más info.`;
  if (!env.GEMINI_API_KEY) return fallback;
  try {
    const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    const ctx = [
      lead.nombre ? `Nombre: ${lead.nombre}` : null,
      lead.auto_interes ? `Interés: ${lead.auto_interes}` : null,
      lead.presupuesto ? `Presupuesto: ${lead.presupuesto}` : null,
      lead.resumen ? `Resumen: ${lead.resumen}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const res = await ai.models.generateContent({
      model: env.GEMINI_MODEL,
      contents:
        `Redactá UN mensaje corto de seguimiento por WhatsApp (máximo 3 oraciones, ` +
        `sin markdown, tono rioplatense cercano, máximo un emoji) para retomar contacto ` +
        `con este lead de una concesionaria de autos:\n${ctx}\nDevolvé SOLO el texto del mensaje.`,
    });
    const text = (res.text ?? "").trim();
    return text.length > 0 ? text.slice(0, 1000) : fallback;
  } catch {
    return fallback;
  }
}
