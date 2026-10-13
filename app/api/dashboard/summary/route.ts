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
  periodLabel,
  resolveRange,
  type PeriodSpec,
} from "@/lib/metrics";

const MAX_CUSTOM_MS = 400 * 24 * 60 * 60 * 1000; // tope anti-abuso

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

/**
 * GET /api/dashboard/summary?period=today|7d|30d|all|custom&from=ISO&to=ISO
 * Agregados del período + período anterior (para variación), mapa de calor,
 * modelos vs stock e insights por reglas. Lo pesado se calcula en SQL.
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
  const site = getSiteConfig();
  const supabase = getSupabaseAdmin();

  const cur = resolveRange(spec);
  const iso = (d: Date): string => d.toISOString();

  const [curRes, heatRes, dailyRes, modelsRes, stockRes, stockSettingsRes] = await Promise.all([
    supabase.rpc("dashboard_summary", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_heatmap", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_daily", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.rpc("dashboard_models", { p_from: iso(cur.from), p_to: iso(cur.to) }),
    supabase.from("vehicles").select("modelo").eq("estado", "disponible"),
    supabase.from("stock_settings").select("updated_at,stale_days").eq("id", 1).maybeSingle(),
  ]);

  if (curRes.error) {
    return NextResponse.json(
      { error: `No se pudo calcular el resumen: ${curRes.error?.message}` },
      { status: 500 },
    );
  }

  const curJson = curRes.data as SummaryJson;
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
    period: parsed.data.period,
    periodLabel: periodLabel(spec),
    site: { name: site.name, humanReplyReference: site.humanReplyReferenceLabel },
    hasDemoData: curJson.demo_count > 0,
    demoMode: isDemoMode(getEnv()),
    metrics: {
      consultas: { value: curJson.consultas },
      atendidas: { value: curJson.atendidas },
      primeraRespuestaSeg: { value: mediana },
      fueraHorario: { value: curJson.fuera_horario },
      calientes: { value: curJson.calientes },
      derivados: { value: curJson.derivados },
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
