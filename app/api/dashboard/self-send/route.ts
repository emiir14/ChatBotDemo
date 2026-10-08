import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, isDemoMode } from "@/lib/env";
import { sendWhatsAppTemplate } from "@/lib/meta";

const bodySchema = z.object({
  /** Destinatario en dígitos (ej. 5493515550101). Debe ser tester del número. */
  to: z.string().regex(/^\d{8,15}$/, "Teléfono inválido (solo dígitos, 8 a 15)"),
});

/**
 * POST /api/dashboard/self-send { to } — botón "Enviarme WhatsApp".
 * Envía la plantilla hello_world (sirve aunque pasen las 24 hs).
 * Solo con DEMO_MODE=true.
 */
export async function POST(req: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Pedido inválido" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Teléfono inválido" }, { status: 400 });
  }
  let demo = false;
  try {
    demo = isDemoMode(getEnv());
  } catch {
    demo = false;
  }
  if (!demo) {
    return NextResponse.json(
      { error: "Solo disponible con DEMO_MODE=true" },
      { status: 403 },
    );
  }
  const sent = await sendWhatsAppTemplate({ to: parsed.data.to });
  if (!sent.ok) {
    return NextResponse.json(
      { error: `Meta no lo aceptó: ${sent.errorMessage}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
