import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, isDemoMode } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSiteConfig } from "@/lib/site-config";
import {
  buildFunnel,
  buildInsights,
  diaNombre,
  median,
  periodRange,
  previousRange,
  variation,
  type PeriodKey,
} from "@/lib/metrics";

const querySchema = z.object({
  period: z.enum(["today", "7d", "30d"]).default("7d"),
});

interface SummaryJson {
  consultas: number;
  atendidas: number;
  calientes: number;
  calificados: number;
  derivados: number;
  requieren_humano: number;
  fuera_horario: number;
  demo_count: number;
  mensajes: number;
  first_responses: number[];
}

interface HeatCell {
  dow: number;
  hour: number;
  n: number;
}

interface ModelRow {
  modelo: string;
  consultas: number;
}

/**
 * GET /api/dashboard/summary?period=today|7d|30d
 * Agregados del período + período anterior (para variación), mapa de calor,
 * modelos vs stock e insights por reglas. Lo pesado se calcula en SQL.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  const period = parsed.data.period as PeriodKey;
  const site = getSiteConfig();
  const supabase = getSupabaseAdmin();

  const cur = periodRange(period);
  const prev = previousRange(cur);
  const today = periodRange("today");
  const iso = (d: Date): string => d.toISOString();

  const [curRes, prevRes, todayRes, heatRes, dailyRes, modelsRes, stockRes, stockSettingsRes] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_summary", { p_from: iso(prev.from), p_to: iso(prev.to) }),
    supabase.rpc("dashboard_summary", { p_from: iso(today.from), p_to: iso(today.to) }),
    supabase.rpc("dashboard_heatmap", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_daily", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_models", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.from("vehicles").select("modelo").eq("estado", "disponible"),
    supabase.from("stock_settings").select("updated_at,stale_days").eq("id", 1).maybeSingle(),
  ]);

  if (curRes.error || prevRes.error) {
    return NextResponse.json(
      { error: `No se pudo calcular el resumen: ${curRes.error?.message ?? prevRes.error?.message}` },
      { status: 500 },
    );
  }

  const curJson = curRes.data as SummaryJson;
  const prevJson = prevRes.data as SummaryJson;
  const todayJson = (todayRes.data ?? {}) as Partial<SummaryJson>;
  const cells = (heatRes.data ?? []) as HeatCell[];
  const daily = ((dailyRes.data ?? []) as Array<{ day: string; n: number }>).map(
    (d) => ({ day: d.day, n: Number(d.n) }),
  );
  const models = (modelsRes.data ?? []) as ModelRow[];
  const stockModels = ((stockRes.data ?? []) as Array<{ modelo: string }>).map(
    (v) => v.modelo,
  );

  const mediana = median(curJson.first_responses ?? []);

  // Modelos vs stock: coincidencia por inclusión (auto_interes es texto libre).
  const stockCountFor = (modelo: string): number => {
    const needle = modelo.toLowerCase();
    return stockModels.filter(
      (s) =>
        s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase()),
    ).length;
  };
  const modelsVsStock = models.slice(0, 5).map((m) => ({
    modelo: m.modelo,
    consultas: Number(m.consultas),
    stock: stockCountFor(m.modelo),
  }));

  // Pico del mapa de calor.
  let pico: { dia: string; hora: number; n: number } | null = null;
  for (const c of cells) {
    if (!pico || c.n > pico.n) {
      pico = { dia: diaNombre(c.dow), hora: c.hour, n: Number(c.n) };
    }
  }

  const funnel = buildFunnel([
    { key: "consultas", label: "Consultas", value: curJson.consultas },
    { key: "calificados", label: "Calificados", value: curJson.calificados },
    { key: "calientes", label: "Calientes", value: curJson.calientes },
    { key: "derivados", label: "Derivados a asesor", value: curJson.derivados },
  ]);

  const insights = buildInsights({
    atendidas: curJson.atendidas,
    fueraHorario: curJson.fuera_horario,
    calientesSinAtender: curJson.requieren_humano,
    topModelo: modelsVsStock[0] ?? null,
    pico,
  });

  // Frescura del stock (alerta si supera el umbral configurable).
  const st = (stockSettingsRes.data as { updated_at?: string; stale_days?: number } | null) ?? {};
  const stockUpdatedAt = st.updated_at ?? null;
  const staleDays = st.stale_days ?? 4;
  const daysSinceUpdate = stockUpdatedAt
    ? (Date.now() - new Date(stockUpdatedAt).getTime()) / (24 * 60 * 60 * 1000)
    : null;

  return NextResponse.json({
    period,
    site: { name: site.name, humanReplyReference: site.humanReplyReferenceLabel },
    hasDemoData: curJson.demo_count > 0,
    demoMode: isDemoMode(getEnv()),
    metrics: {
      hoy: { value: todayJson.consultas ?? 0 },
      atendidas: { value: curJson.atendidas, variation: variation(curJson.atendidas, prevJson.atendidas) },
      primeraRespuestaSeg: { value: mediana, variation: null },
      fueraHorario: { value: curJson.fuera_horario, variation: variation(curJson.fuera_horario, prevJson.fuera_horario) },
      calientes: { value: curJson.calientes, variation: variation(curJson.calientes, prevJson.calientes) },
      tasaCalificacion: {
        value: curJson.consultas > 0 ? (curJson.calificados / curJson.consultas) * 100 : 0,
        variation: null,
      },
      mensajes: { value: curJson.mensajes ?? 0 },
      derivados: { value: curJson.derivados, variation: variation(curJson.derivados, prevJson.derivados) },
    },
    funnel,
    heatmap: cells,
    daily,
    modelsVsStock,
    insights,
    actionCount: curJson.requieren_humano,
    stock: {
      updatedAt: stockUpdatedAt,
      staleDays,
      daysSinceUpdate,
      isStale: daysSinceUpdate !== null && daysSinceUpdate > staleDays,
    },
  });
}
