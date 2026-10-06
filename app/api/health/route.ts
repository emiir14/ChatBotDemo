import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";

/**
 * GET /api/health — chequeo rápido para la demo.
 * Confirma: variables presentes, conexión con Supabase y config de Gemini.
 * No expone secretos. Responde 200 con el detalle por chequeo.
 */
export async function GET(): Promise<NextResponse> {
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
  // degradado en lugar de romper: útil durante la Etapa 1).
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

  // Gemini (Etapa 1): solo se valida configuración (clave + modelo).
  // El ping real contra la API se agrega en la Etapa 2.
  if (env.GEMINI_API_KEY) {
    checks.gemini = {
      ok: true,
      detail: `Configurado (modelo ${env.GEMINI_MODEL}). Ping real en Etapa 2.`,
    };
  } else {
    checks.gemini = { ok: false, detail: "Falta GEMINI_API_KEY." };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 500 });
}
