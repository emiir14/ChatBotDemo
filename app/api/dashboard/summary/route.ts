import { NextResponse } from "next/server";
import { z } from "zod";
import { getEnv, isDemoMode } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSiteConfig } from "@/lib/site-config";
import { DEFAULT_STALE_DAYS } from "@/lib/stock-server";
import { getOrCompute } from "@/lib/analytics-cache";
import {
  buildFunnel,
  buildInsights,
  buildResponseHistogram,
  diaNombre,
  median,
  periodLabel,
  previousRange,
  resolveRange,
  validateCustomBounds,
  variation,
  type PeriodRange,
  type PeriodSpec,
  type ResponseHistogram,
} from "@/lib/metrics";
import type { LeadEstado, Temperatura, Variation } from "@/components/dashboard/types";

const MAX_CUSTOM_MS = 400 * 24 * 60 * 60 * 1000; // tope anti-abuso
const ANALYTICS_TTL_SECONDS = 300; // 5 min: equilibra frescura y cuota

const querySchema = z.object({
  period: z.enum(["today", "7d", "30d", "all", "custom"]).default("today"),
  from: z.string().optional(),
  to: z.string().optional(),
}).superRefine((q, ctx) => {
  if (q.period !== "custom") return;
  const from = q.from ? new Date(q.from) : null;
  const to = q.to ? new Date(q.to) : null;
  if (!from || Number.isNaN(from.getTime()) || !to || Number.isNaN(to.getTime())) {
    ctx.addIssue({ code: "custom", message: "Rango inválido (from/to ISO)" });
    return;
  }
  if (from.getTime() >= to.getTime()) {
    ctx.addIssue({ code: "custom", message: "from debe ser anterior a to" });
    return;
  }
  const bounds = validateCustomBounds(from, to);
  if (!bounds.ok) {
    ctx.addIssue({ code: "custom", message: bounds.msg ?? "Rango inválido" });
    return;
  }
  if (to.getTime() - from.getTime() > MAX_CUSTOM_MS) {
    ctx.addIssue({ code: "custom", message: "Rango máximo: 400 días" });
  }
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

interface ModelStageRow {
  modelo: string;
  consultas: number;
  calificados: number;
  calientes: number;
  derivados: number;
}

interface PriceRow {
  bucket: string;
  consultas: number;
  stock: number;
}

interface RecontactJson {
  total: number;
  bot: number;
  agente: number;
  respondieron: number;
}

interface Bundle {
  hasDemoData: boolean;
  metrics: {
    consultas: { value: number; delta: Variation | null };
    atendidas: { value: number; delta: Variation | null };
    primeraRespuestaSeg: { value: number | null };
    fueraHorario: { value: number; delta: Variation | null };
    calientes: { value: number; delta: Variation | null };
    derivados: { value: number; delta: Variation | null };
  };
  funnel: ReturnType<typeof buildFunnel>;
  heatmap: HeatCell[];
  daily: Array<{ day: string; n: number }>;
  tempDist: Array<{ key: Temperatura; n: number }>;
  estadoDist: Array<{ key: LeadEstado; n: number }>;
  firstResponse: ResponseHistogram;
  businessHours: { dentro: number; fuera: number; total: number };
  recontact: RecontactJson;
  modelsStages: ModelStageRow[];
  priceDemand: PriceRow[];
  modelsVsStock: Array<{ modelo: string; consultas: number; stock: number }>;
  insights: Array<{ text: string }>;
}

const TEMP_ORDER: Temperatura[] = ["caliente", "tibio", "frio"];
const ESTADO_ORDER: LeadEstado[] = ["nuevo", "en_conversacion", "derivado", "recontactado"];

async function computeBundle(
  supabase: SupabaseClient,
  cur: PeriodRange,
  prev: PeriodRange,
  arsPerUsd: number,
): Promise<Bundle> {
  const iso = (d: Date): string => d.toISOString();
  const args = { p_from: iso(cur.from), p_to: iso(cur.to) };

  const [
    curRes,
    prevRes,
    heatRes,
    dailyRes,
    modelsRes,
    tempRes,
    estadoRes,
    stagesRes,
    recontactRes,
    priceRes,
    stockRes,
  ] = await Promise.all([
    supabase.rpc("dashboard_summary", args),
    supabase.rpc("dashboard_summary", { p_from: iso(prev.from), p_to: iso(prev.to) }),
    supabase.rpc("dashboard_heatmap", args),
    supabase.rpc("dashboard_daily", args),
    supabase.rpc("dashboard_models", args),
    supabase.rpc("dashboard_temp_dist", args),
    supabase.rpc("dashboard_estado_dist", args),
    supabase.rpc("dashboard_models_stages", { ...args, p_limit: 6 }),
    supabase.rpc("dashboard_recontact", args),
    supabase.rpc("dashboard_price_demand", { ...args, p_ars_per_usd: arsPerUsd }),
    supabase.from("vehicles").select("modelo").eq("estado", "disponible"),
  ]);

  if (curRes.error) {
    throw new Error(`No se pudo calcular el resumen: ${curRes.error.message}`);
  }

  const curJson = curRes.data as SummaryJson;
  const prevJson = (prevRes.error ? null : (prevRes.data as SummaryJson | null)) ?? null;

  const cells = (heatRes.data ?? []) as HeatCell[];
  const daily = ((dailyRes.data ?? []) as Array<{ day: string; n: number }>).map((d) => ({
    day: d.day,
    n: Number(d.n),
  }));
  const models = (modelsRes.data ?? []) as ModelRow[];
  const stockModels = ((stockRes.data ?? []) as Array<{ modelo: string }>).map((v) => v.modelo);

  const mediana = median(curJson.first_responses ?? []);
  const firstResponse = buildResponseHistogram(curJson.first_responses ?? []);

  // Distribución por temperatura (orden fijo, completando ceros).
  const tempMap = new Map<string, number>(
    ((tempRes.data ?? []) as Array<{ temperatura: string; n: number }>).map((r) => [
      r.temperatura,
      Number(r.n),
    ]),
  );
  const tempDist = TEMP_ORDER.map((key) => ({ key, n: tempMap.get(key) ?? 0 }));

  // Distribución por etapa (orden fijo, completando ceros).
  const estadoMap = new Map<string, number>(
    ((estadoRes.data ?? []) as Array<{ estado: string; n: number }>).map((r) => [
      r.estado,
      Number(r.n),
    ]),
  );
  const estadoDist = ESTADO_ORDER.map((key) => ({ key, n: estadoMap.get(key) ?? 0 }));

  // Modelos vs stock: coincidencia por inclusión (auto_interes es texto libre).
  const stockCountFor = (modelo: string): number => {
    const needle = modelo.toLowerCase();
    return stockModels.filter((s) => s.toLowerCase().includes(needle) || needle.includes(s.toLowerCase())).length;
  };
  const modelsVsStock = models.slice(0, 5).map((m) => ({
    modelo: m.modelo,
    consultas: Number(m.consultas),
    stock: stockCountFor(m.modelo),
  }));

  const modelsStages: ModelStageRow[] = ((stagesRes.data ?? []) as ModelStageRow[]).map((r) => ({
    modelo: r.modelo,
    consultas: Number(r.consultas),
    calificados: Number(r.calificados),
    calientes: Number(r.calientes),
    derivados: Number(r.derivados),
  }));

  const priceDemand: PriceRow[] = ((priceRes.data ?? []) as PriceRow[]).map((r) => ({
    bucket: r.bucket,
    consultas: Number(r.consultas),
    stock: Number(r.stock),
  }));

  const recontact: RecontactJson = (recontactRes.error ? null : (recontactRes.data as RecontactJson | null)) ?? {
    total: 0,
    bot: 0,
    agente: 0,
    respondieron: 0,
  };

  // Pico del mapa de calor (para insights).
  let pico: { dia: string; hora: number; n: number } | null = null;
  for (const c of cells) {
    if (!pico || c.n > pico.n) pico = { dia: diaNombre(c.dow), hora: c.hour, n: Number(c.n) };
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

  const delta = (key: keyof SummaryJson): Variation | null =>
    prevJson ? variation(Number(curJson[key]), Number(prevJson[key])) : null;

  return {
    hasDemoData: curJson.demo_count > 0,
    metrics: {
      consultas: { value: Number(curJson.consultas), delta: delta("consultas") },
      atendidas: { value: Number(curJson.atendidas), delta: delta("atendidas") },
      primeraRespuestaSeg: { value: mediana },
      fueraHorario: { value: Number(curJson.fuera_horario), delta: delta("fuera_horario") },
      calientes: { value: Number(curJson.calientes), delta: delta("calientes") },
      derivados: { value: Number(curJson.derivados), delta: delta("derivados") },
    },
    funnel,
    heatmap: cells,
    daily,
    tempDist,
    estadoDist,
    firstResponse,
    businessHours: {
      dentro: Math.max(0, Number(curJson.atendidas) - Number(curJson.fuera_horario)),
      fuera: Number(curJson.fuera_horario),
      total: Number(curJson.atendidas),
    },
    recontact,
    modelsStages,
    priceDemand,
    modelsVsStock,
    insights,
  };
}

/**
 * GET /api/dashboard/summary?period=today|7d|30d|all|custom&from=ISO&to=ISO
 * Agregados del período + período anterior (para variación), mapas, distribuciones
 * e insights. Lo pesado se calcula en SQL y se cachea unos minutos.
 */
export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    period: url.searchParams.get("period") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  const spec: PeriodSpec =
    parsed.data.period === "custom"
      ? { key: "custom", from: new Date(parsed.data.from as string), to: new Date(parsed.data.to as string) }
      : parsed.data.period;
  const env = getEnv();
  const site = getSiteConfig();
  const supabase = getSupabaseAdmin();

  const cur = resolveRange(spec);
  const prev = previousRange(cur);
  const iso = (d: Date): string => d.toISOString();

  const cacheKey = `summary:v2:${parsed.data.period}:${iso(cur.from)}:${iso(cur.to)}:${env.PRICE_ARS_PER_USD}`;

  let bundle: Bundle;
  try {
    bundle = await getOrCompute(cacheKey, ANALYTICS_TTL_SECONDS, () =>
      computeBundle(supabase, cur, prev, env.PRICE_ARS_PER_USD),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo calcular el resumen" },
      { status: 500 },
    );
  }

  // Datos "vivos" (no cacheados): cola de atención y frescura del stock.
  const [actionRes, stockSettingsRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("requiere_humano", true)
      .is("atendido_at", null),
    supabase.from("stock_settings").select("updated_at,stale_days").eq("id", 1).maybeSingle(),
  ]);

  const st = (stockSettingsRes.data as { updated_at?: string; stale_days?: number } | null) ?? {};
  const stockUpdatedAt = st.updated_at ?? null;
  const staleDays = st.stale_days ?? DEFAULT_STALE_DAYS;
  const daysSinceUpdate = stockUpdatedAt
    ? (Date.now() - new Date(stockUpdatedAt).getTime()) / (24 * 60 * 60 * 1000)
    : null;

  return NextResponse.json({
    period: parsed.data.period,
    periodLabel: periodLabel(spec),
    site: { name: site.name, humanReplyReference: site.humanReplyReferenceLabel },
    hasDemoData: bundle.hasDemoData,
    demoMode: isDemoMode(env),
    metrics: bundle.metrics,
    funnel: bundle.funnel,
    heatmap: bundle.heatmap,
    daily: bundle.daily,
    tempDist: bundle.tempDist,
    estadoDist: bundle.estadoDist,
    firstResponse: bundle.firstResponse,
    businessHours: bundle.businessHours,
    recontact: bundle.recontact,
    modelsStages: bundle.modelsStages,
    priceDemand: bundle.priceDemand,
    modelsVsStock: bundle.modelsVsStock,
    insights: bundle.insights,
    actionCount: actionRes.count ?? 0,
    stock: {
      updatedAt: stockUpdatedAt,
      staleDays,
      daysSinceUpdate,
      isStale: daysSinceUpdate !== null && daysSinceUpdate > staleDays,
    },
  });
}
