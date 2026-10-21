import { getEnv } from "@/lib/env";
import { generateBotReply, pingGemini, resolveGeminiModels } from "@/lib/bot";
import type { Vehicle } from "@/lib/supabase";

/**
 * Lógica del chequeo de salud (solo servidor). La usa la server action de
 * /salud. No es una API pública: no hay endpoint HTTP separado.
 */

export interface ModelPing {
  model: string;
  ok: boolean;
  code?: number;
  status?: string;
  ms: number;
}

export interface BotRun {
  ok: boolean;
  model?: string;
  ms: number;
  reply?: string;
  error?: string;
}

export interface CheckItem {
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  ok: boolean;
  checks: Record<string, CheckItem>;
  models: ModelPing[];
  botRun: BotRun | null;
}

export async function runHealthCheck(deep: boolean): Promise<HealthReport> {
  const checks: Record<string, CheckItem> = {};
  let botRun: BotRun | null = null;

  let env;
  try {
    env = getEnv();
    checks.env = { ok: true, detail: "Variables base presentes." };
  } catch (err) {
    checks.env = {
      ok: false,
      detail: err instanceof Error ? err.message : "Variables inválidas.",
    };
    return { ok: false, checks, models: [], botRun: null };
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
      const reply = result.reply;
      checks.bot = {
        ok: reply.length > 0,
        detail: `Respondió ${result.model ?? "?"} en ${ms} ms: "${reply.slice(0, 200)}"`,
      };
      botRun = { ok: reply.length > 0, model: result.model, ms, reply };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      checks.bot = { ok: false, detail: `El bot no pudo responder: ${message}` };
      botRun = { ok: false, ms: 0, error: message };
    }
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return { ok, checks, models: pings, botRun };
}
