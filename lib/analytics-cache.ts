import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Caché simple de consultas pesadas sobre la tabla `analytics_cache`.
 *
 * Motivo: la pestaña "Resumen de consultas" hace ~10 agregaciones por período.
 * Con TTL corto (5-10 min) se evita recalcularlas en cada request y se cuida
 * la cuota de Supabase y Vercel. Es "best-effort": si la tabla no existe
 * todavía (migración sin correr) o falla, se calcula igual sin cachear.
 */
export async function getOrCompute<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<T> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("analytics_cache")
    .select("payload, created_at")
    .eq("key", key)
    .maybeSingle();

  if (!error && data) {
    const row = data as { payload: T; created_at: string };
    const ageSeconds = (Date.now() - new Date(row.created_at).getTime()) / 1000;
    if (ageSeconds >= 0 && ageSeconds < ttlSeconds) return row.payload;
  }

  const fresh = await compute();

  try {
    await supabase
      .from("analytics_cache")
      .upsert(
        { key, payload: fresh as unknown as Record<string, unknown>, created_at: new Date().toISOString() },
        { onConflict: "key" },
      );
  } catch {
    // Best-effort: si el upsert falla, igual devolvemos el cálculo fresco.
  }

  return fresh;
}
