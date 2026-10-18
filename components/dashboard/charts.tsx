"use client";

import { useMemo, type JSX } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { Download } from "lucide-react";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BUSINESS_TIME_ZONE } from "@/lib/time";
import { toCsv, downloadCsv } from "@/lib/csv";
import { Button } from "@/components/ui/Button";
import type { SummaryResponse } from "./types";

const AXIS_TICK = { fontSize: 10, fill: "var(--ink-3)" } as const;

function EmptyChart({ message }: { message: string }): JSX.Element {
  return (
    <div className="card flex h-44 items-center justify-center p-5 text-center">
      <p className="text-sm text-(--ink-2)">{message}</p>
    </div>
  );
}

function fmtDay(day: string): string {
  const d = new Date(day);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", timeZone: BUSINESS_TIME_ZONE }).format(d);
}

const TEMP_LABEL: Record<string, string> = { caliente: "Calientes", tibio: "Tibios", frio: "Fríos" };
const TEMP_COLOR: Record<string, string> = {
  caliente: "var(--chart-4)",
  tibio: "var(--chart-3)",
  frio: "var(--chart-2)",
};
const ESTADO_LABEL: Record<string, string> = {
  nuevo: "Nuevos",
  en_conversacion: "En conversación",
  derivado: "Derivados",
  recontactado: "Recontactados",
};

// ---------------------------------------------------------------------------
// Tendencia diaria de consultas
// ---------------------------------------------------------------------------
const TREND_CONFIG = { n: { label: "Consultas", color: "var(--chart-1)" } } satisfies ChartConfig;

export function DailyTrend({ data }: { data: SummaryResponse["daily"] }): JSX.Element {
  const rows = useMemo(() => data.map((d) => ({ day: fmtDay(d.day), n: d.n })), [data]);
  if (rows.length === 0) return <EmptyChart message="Todavía no hay consultas en este período." />;
  return (
    <div className="card p-4">
      <ChartContainer config={TREND_CONFIG} className="aspect-auto h-56 w-full" role="img" aria-label="Consultas por día">
        <AreaChart data={rows} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fill-trend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={AXIS_TICK} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Area type="monotone" dataKey="n" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fill-trend)" isAnimationActive={false} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiempo de primera respuesta (histograma) + SLA
// ---------------------------------------------------------------------------
const SLA_CONFIG = { n: { label: "Consultas", color: "var(--chart-1)" } } satisfies ChartConfig;

export function FirstResponse({ data }: { data: SummaryResponse["firstResponse"] }): JSX.Element {
  if (data.total === 0) return <EmptyChart message="Sin respuestas medidas todavía." />;
  const withinPct = Math.round((data.withinSla / data.total) * 100);
  const slaMinutes = Math.round(data.slaSeconds / 60);
  const max = Math.max(1, ...data.buckets.map((b) => b.n));
  return (
    <div className="card p-4">
      <p className="mb-2 text-sm">
        <strong className="text-(--ok)">{withinPct}%</strong> respondidas en menos de {slaMinutes} min
        <span className="text-(--ink-2)"> ({data.withinSla} de {data.total})</span>. Las barras ámbar quedaron fuera del objetivo.
      </p>
      <ChartContainer config={SLA_CONFIG} className="aspect-auto h-48 w-full" role="img" aria-label="Histograma del tiempo de primera respuesta">
        <BarChart data={data.buckets} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} angle={-20} textAnchor="end" height={44} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.buckets.map((b, i) => (
              <Cell key={b.label} fill={b.n === max ? "var(--chart-1)" : i >= 4 ? "var(--chart-3)" : "var(--chart-2)"} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribución por temperatura (dona)
// ---------------------------------------------------------------------------
export function TempDist({ data }: { data: SummaryResponse["tempDist"] }): JSX.Element {
  const rows = data.filter((d) => d.n > 0).map((d) => ({ key: d.key, label: TEMP_LABEL[d.key] ?? d.key, n: d.n, fill: TEMP_COLOR[d.key] }));
  const total = rows.reduce((a, b) => a + b.n, 0);
  const config = useMemo(() => {
    const c: ChartConfig = {};
    for (const r of rows) c[r.key] = { label: r.label, color: r.fill };
    return c;
  }, [rows]);
  if (total === 0) return <EmptyChart message="Sin datos de temperatura." />;
  return (
    <div className="card p-4">
      <ChartContainer config={config} className="mx-auto aspect-square h-52" role="img" aria-label="Distribución por temperatura">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
          <Pie data={rows} dataKey="n" nameKey="key" innerRadius={52} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.fill} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="key" />} />
        </PieChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Distribución por etapa (barras horizontales)
// ---------------------------------------------------------------------------
const ESTADO_CONFIG = { n: { label: "Leads", color: "var(--chart-1)" } } satisfies ChartConfig;

export function EstadoDist({ data }: { data: SummaryResponse["estadoDist"] }): JSX.Element {
  const rows = data.map((d) => ({ key: d.key, label: ESTADO_LABEL[d.key] ?? d.key, n: d.n }));
  const total = rows.reduce((a, b) => a + b.n, 0);
  if (total === 0) return <EmptyChart message="Sin datos de etapa." />;
  return (
    <div className="card p-4">
      <ChartContainer config={ESTADO_CONFIG} className="aspect-auto h-52 w-full" role="img" aria-label="Distribución por etapa">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} width={104} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="n" radius={[0, 3, 3, 0]} isAnimationActive={false} fill="var(--chart-1)" />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horario comercial vs fuera de horario (dona)
// ---------------------------------------------------------------------------
export function BusinessHours({ data }: { data: SummaryResponse["businessHours"] }): JSX.Element {
  const total = data.dentro + data.fuera;
  if (total === 0) return <EmptyChart message="Sin consultas atendidas todavía." />;
  const rows = [
    { key: "dentro", label: "En horario", n: data.dentro, fill: "var(--chart-1)" },
    { key: "fuera", label: "Fuera de horario", n: data.fuera, fill: "var(--chart-3)" },
  ];
  const config: ChartConfig = {
    dentro: { label: "En horario", color: "var(--chart-1)" },
    fuera: { label: "Fuera de horario", color: "var(--chart-3)" },
  };
  const fueraPct = Math.round((data.fuera / total) * 100);
  return (
    <div className="card p-4">
      <p className="mb-2 text-sm">
        El <strong>{fueraPct}%</strong> ({data.fuera}) llega fuera de horario. El bot las atiende igual.
      </p>
      <ChartContainer config={config} className="mx-auto aspect-square h-52" role="img" aria-label="Consultas en horario vs fuera de horario">
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent nameKey="key" />} />
          <Pie data={rows} dataKey="n" nameKey="key" innerRadius={52} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.fill} />
            ))}
          </Pie>
          <ChartLegend content={<ChartLegendContent nameKey="key" />} />
        </PieChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recontacto: bot vs agente + efectividad
// ---------------------------------------------------------------------------
const RECONTACT_CONFIG = { n: { label: "Leads", color: "var(--chart-2)" } } satisfies ChartConfig;

export function Recontact({ data }: { data: SummaryResponse["recontact"] }): JSX.Element {
  if (data.total === 0) return <EmptyChart message="Sin recontactos en este período." />;
  const rows = [
    { key: "bot", label: "Recontactó el bot", n: data.bot, fill: "var(--chart-2)" },
    { key: "agente", label: "Recontactó un asesor", n: data.agente, fill: "var(--chart-5)" },
  ];
  const efectividad = Math.round((data.respondieron / data.total) * 100);
  return (
    <div className="card p-4">
      <p className="mb-2 text-sm">
        <strong className="text-(--ok)">{efectividad}%</strong> volvió a responder tras el recontacto
        <span className="text-(--ink-2)"> ({data.respondieron} de {data.total})</span>.
      </p>
      <ChartContainer config={RECONTACT_CONFIG} className="aspect-auto h-40 w-full" role="img" aria-label="Recontactos del bot vs del asesor">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} width={130} />
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="n" radius={[0, 3, 3, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.key} fill={r.fill} />
            ))}
          </Bar>
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Embudo por modelo (barras apiladas)
// ---------------------------------------------------------------------------
const STAGES_CONFIG: ChartConfig = {
  consultas: { label: "Consultas", color: "var(--chart-1)" },
  calificados: { label: "Calificados", color: "var(--chart-2)" },
  calientes: { label: "Calientes", color: "var(--chart-3)" },
  derivados: { label: "Derivados", color: "var(--chart-4)" },
};

export function ModelStages({ data }: { data: SummaryResponse["modelsStages"] }): JSX.Element {
  if (data.length === 0) return <EmptyChart message="Sin modelos consultados todavía." />;
  const rows = data.map((d) => ({
    modelo: d.modelo.length > 18 ? `${d.modelo.slice(0, 17)}…` : d.modelo,
    consultas: d.consultas,
    calificados: d.calificados,
    calientes: d.calientes,
    derivados: d.derivados,
  }));
  return (
    <div className="card p-4">
      <ChartContainer config={STAGES_CONFIG} className="aspect-auto h-64 w-full" role="img" aria-label="Embudo por modelo">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--line)" />
          <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} />
          <YAxis type="category" dataKey="modelo" tickLine={false} axisLine={false} tick={AXIS_TICK} width={110} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="consultas" stackId="s" fill="var(--chart-1)" isAnimationActive={false} />
          <Bar dataKey="calificados" stackId="s" fill="var(--chart-2)" isAnimationActive={false} />
          <Bar dataKey="calientes" stackId="s" fill="var(--chart-3)" isAnimationActive={false} />
          <Bar dataKey="derivados" stackId="s" fill="var(--chart-4)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demanda vs stock por rango de precio (barras agrupadas)
// ---------------------------------------------------------------------------
const PRICE_CONFIG: ChartConfig = {
  consultas: { label: "Consultas", color: "var(--chart-1)" },
  stock: { label: "En stock", color: "var(--chart-5)" },
};

const PRICE_SHORT: Record<string, string> = {
  "Menos de USD 20.000": "< USD 20k",
  "USD 20.000 a 30.000": "USD 20–30k",
  "USD 30.000 a 40.000": "USD 30–40k",
  "USD 40.000 a 50.000": "USD 40–50k",
  "USD 50.000 o más": "USD 50k+",
  "Sin dato": "Sin dato",
};

export function PriceDemand({ data }: { data: SummaryResponse["priceDemand"] }): JSX.Element {
  const rows = data.map((d) => ({
    bucket: PRICE_SHORT[d.bucket] ?? d.bucket,
    consultas: d.consultas,
    stock: d.stock,
  }));
  if (rows.every((r) => r.consultas === 0 && r.stock === 0)) return <EmptyChart message="Sin datos de presupuesto o precios." />;
  return (
    <div className="card p-4">
      <ChartContainer config={PRICE_CONFIG} className="aspect-auto h-56 w-full" role="img" aria-label="Demanda de consultas contra stock por rango de precio">
        <BarChart data={rows} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="bucket" tickLine={false} axisLine={false} tick={AXIS_TICK} interval={0} angle={-20} textAnchor="end" height={44} />
          <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={40} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="consultas" fill="var(--chart-1)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="stock" fill="var(--chart-5)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartContainer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export a CSV de todo el resumen
// ---------------------------------------------------------------------------
export function ExportCsvButton({ summary }: { summary?: SummaryResponse }): JSX.Element {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={!summary}
      tooltip={summary ? "Descargar los datos de esta pestaña en CSV" : "Cargando datos…"}
      onClick={() => {
        if (!summary) return;
        const rows: Array<Record<string, string | number>> = [];
        const push = (seccion: string, etiqueta: string, valor: string | number): void => {
          rows.push({ seccion, etiqueta, valor });
        };
        push("Resumen", "Período", summary.periodLabel);
        push("Resumen", "Consultas", summary.metrics.consultas.value);
        push("Resumen", "Atendidas", summary.metrics.atendidas.value);
        push("Resumen", "En espera", summary.actionCount);
        push("Resumen", "Calientes", summary.metrics.calientes.value);
        push("Resumen", "Derivados", summary.metrics.derivados.value);
        push("Resumen", "Fuera de horario", summary.metrics.fueraHorario.value);
        push("Resumen", "Primera respuesta (seg)", summary.metrics.primeraRespuestaSeg.value ?? "");
        for (const s of summary.funnel) push("Embudo", s.label, s.value);
        for (const d of summary.daily) push("Tendencia diaria", d.day, d.n);
        for (const d of summary.tempDist) push("Temperatura", TEMP_LABEL[d.key] ?? d.key, d.n);
        for (const d of summary.estadoDist) push("Etapa", ESTADO_LABEL[d.key] ?? d.key, d.n);
        for (const b of summary.firstResponse.buckets) push("Primera respuesta", b.label, b.n);
        push("Horario", "En horario", summary.businessHours.dentro);
        push("Horario", "Fuera de horario", summary.businessHours.fuera);
        push("Recontacto", "Bot", summary.recontact.bot);
        push("Recontacto", "Asesor", summary.recontact.agente);
        push("Recontacto", "Respondieron", summary.recontact.respondieron);
        for (const m of summary.modelsStages) {
          push("Modelos · consultas", m.modelo, m.consultas);
          push("Modelos · calificados", m.modelo, m.calificados);
          push("Modelos · calientes", m.modelo, m.calientes);
          push("Modelos · derivados", m.modelo, m.derivados);
        }
        for (const p of summary.priceDemand) {
          push("Precio · consultas", p.bucket, p.consultas);
          push("Precio · stock", p.bucket, p.stock);
        }
        downloadCsv(`resumen-consultas-${summary.period}.csv`, toCsv(rows));
      }}
    >
      <Download size={14} aria-hidden="true" /> Exportar CSV
    </Button>
  );
}
