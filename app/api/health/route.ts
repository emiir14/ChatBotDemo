import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { generateBotReply, pingGemini, resolveGeminiModels } from "@/lib/bot";
import type { Vehicle } from "@/lib/supabase";

/**
 * GET /api/health — chequeo real para la demo.
 * Confirma: variables presentes, conexión con Supabase y ping REAL a cada
 * modelo de Gemini configurado (no solo config). No expone secretos.
 *
 *   GET /api/health            → env + Supabase + ping por modelo
 *   GET /api/health?deep=1     → además, un dry-run del bot con el stock real
 *                                (gasta 1 llamada a la IA; ideal antes de la reunión).
 *
 * Responde 200 si todo OK, 500 si algo falla (así lo ves de un vistazo).
 */

// La demo corre en Vercel Hobby ($0): el deep check puede sumar unos segundos.
export const maxDuration = 60;

export async function GET(req: Request): Promise<NextResponse> {
  const deep = new URL(req.url).searchParams.get("deep") === "1";
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  let env;
  try {
    env = getEnv();
    checks.env = { ok: true, detail: "Variables base presentes." };
  } catch (err) {
    checks.env = {
      ok: false,
      detail: err instanceof Error ? err.message : "Variables inválidas.",
    };
    return NextResponse.json({ ok: false, checks }, { status: 500 });
  }

  // Supabase: ping liviano (si las tablas aún no existen, se reporta como
  // degradado en lugar de romper).
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("vehicles")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    checks.supabase = { ok: true, detail: "Conexión con Supabase OK." };
  } catch (err) {
    checks.supabase = {
      ok: false,
      detail: `Supabase no disponible: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Gemini: ping REAL a cada modelo de la cascada. Alcanza con que UNO
  // responda para que el bot funcione (el resto son fallbacks).
  const models = resolveGeminiModels(env);
  const pings = await pingGemini(models);
  const up = pings.filter((p) => p.ok);
  checks.gemini = {
    ok: up.length > 0,
    detail: pings
      .map((p) =>
        p.ok
          ? `${p.model}: OK (${p.ms} ms)`
          : `${p.model}: FALLA ${p.status ?? p.code ?? "?"}`,
      )
      .join(" · "),
  };

  // Deep: dry-run end-to-end del cerebro del bot (con el stock real).
  if (deep) {
    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("vehicles")
        .select("*")
        .eq("estado", "disponible")
        .limit(20);
      if (error) throw new Error(error.message);
      const start = Date.now();
      const result = await generateBotReply({
        lead: null,
        history: [],
        vehicles: (data ?? []) as Vehicle[],
        newMessage: "Hola, ¿tenés algún 0km disponible?",
      });
      const ms = Date.now() - start;
      checks.bot = {
        ok: result.reply.length > 0,
        detail: `Respondió ${result.model ?? "?"} en ${ms} ms: "${result.reply.slice(0, 200)}"`,
      };
    } catch (err) {
      checks.bot = {
        ok: false,
        detail: `El bot no pudo responder: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
