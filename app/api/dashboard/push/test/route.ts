import { NextResponse } from "next/server";
import { sendPushToAll } from "@/lib/push-server";

/**
 * Endpoint de prueba para Web Push.
 * Permite enviar un aviso de "Lead caliente" a todos los dispositivos suscriptos
 * (navegador y móvil) sin interactuar con WhatsApp ni consumir tokens de Gemini.
 */
export async function POST(): Promise<NextResponse> {
  await sendPushToAll({
    title: "🔥 Lead caliente (Prueba)",
    body: "Cliente de prueba · Interesado en Toyota Hilux",
    url: "/dashboard",
    tag: "test-lead-caliente",
  });
  return NextResponse.json({ ok: true });
}

