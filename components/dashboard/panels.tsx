"use client";

import { useMemo, type JSX } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Lightbulb } from "lucide-react";
import { SectionTitle } from "./ui";
import { diaNombre } from "@/lib/metrics";
import type { SummaryResponse } from "./types";

/** Mini-gráfico de tendencia (consultas por día). */
export function Sparkline({ data }: { data: Array<{ day: string; n: number }> }): JSX.Element {
  const points = useMemo(() => data.map((d) => ({ n: d.n })), [data]);
  if (points.length < 2) return <div className="h-10" aria-hidden="true" />;
  return (
    <div className="h-10" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
          <Area
            type="monotone"
            dataKey="n"
            stroke="var(--accent)"
            fill="var(--accent-soft)"
            strokeWidth={1.6}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Embudo horizontal simple con % de paso. */
export function Funnel({ steps }: { steps: SummaryResponse["funnel"] }): JSX.Element {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="card p-4" role="img" aria-label={`Embudo: ${steps.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <div className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="tnum">
                <strong>{s.value}</strong>
                {i > 0 && steps[0].value > 0 && (
                  <span className="ml-2 text-xs text-(--ink-2)">
                    {Math.round((s.value / steps[0].value) * 100)}% del total
                  </span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-(--surface-3)">
              <div
                className="h-full rounded-full bg-(--accent)"
                style={{ width: `${Math.max(2, (s.value / max) * 100)}%`, transition: "width 200ms" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cuándo escriben: barras por hora y por día (sin scroll, legible en móvil).
 *  Reemplaza al mapa de calor día×hora: misma data agregada, cero scroll.
 *  Barras ámbar = franjas que suelen caer fuera de horario comercial. */
export function Heatmap({ cells }: { cells: SummaryResponse["heatmap"] }): JSX.Element {
  const hourly = useMemo(() => {
    const totals = Array<number>(24).fill(0);
    for (const c of cells) totals[c.hour] += Number(c.n);
    return totals.map((n, h) => ({ h: `${h}h`, n, off: h < 8 || h >= 20 }));
  }, [cells]);
  const daily = useMemo(() => {
    const totals: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
    for (const c of cells) totals[c.dow] += Number(c.n);
    return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      d: diaNombre(d).slice(0, 3),
      n: totals[d],
      off: d === 7,
    }));
  }, [cells]);
  const maxH = Math.max(1, ...hourly.map((x) => x.n));
  const maxD = Math.max(1, ...daily.map((x) => x.n));
  const total = hourly.reduce((a, b) => a + b.n, 0);
  const peakH = hourly.reduce((a, b) => (b.n > a.n ? b : a), hourly[0]);
  const peakD = daily.reduce((a, b) => (b.n > a.n ? b : a), daily[0]);

  if (total === 0) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-(--ink-2)">Todavía no hay consultas en este período.</p>
      </div>
    );
  }

  const tooltipStyle = {
    background: "var(--surface-2)",
    border: "1px solid var(--line)",
    borderRadius: 8,
    fontSize: 12,
  };

  return (
    <div className="card p-4">
      <p className="mb-2 text-sm">
        Pico: <strong className="capitalize">{peakD.d} {peakH.h}</strong> ({Math.max(peakH.n, 1)} consultas).
        Las barras ámbar caen fuera de horario comercial: el bot las atiende igual.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div role="img" aria-label={`Consultas por hora. Pico a las ${peakH.h}.`}>
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-(--ink-2)">Por hora</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourly} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                <XAxis dataKey="h" tickLine={false} axisLine={false} interval={3} tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} consultas`, ""]}
                  labelFormatter={(l) => `${l} hs`}
                />
                <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {hourly.map((x, i) => (
                    <Cell
                      key={i}
                      fill={
                        x.n === maxH && maxH > 0
                          ? "var(--accent-strong)"
                          : x.off
                            ? "var(--warm)"
                            : "var(--accent)"
                      }
                      fillOpacity={x.n === maxH ? 1 : 0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div role="img" aria-label="Consultas por día de semana.">
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-(--ink-2)">Por día</p>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 0, bottom: 0, left: 0, right: 0 }}>
                <XAxis dataKey="d" tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "var(--ink-3)" }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(v) => [`${v} consultas`, ""]}
                />
                <Bar dataKey="n" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {daily.map((x, i) => (
                    <Cell
                      key={i}
                      fill={
                        x.n === maxD && maxD > 0
                          ? "var(--accent-strong)"
                          : x.off
                            ? "var(--warm)"
                            : "var(--accent)"
                      }
                      fillOpacity={x.n === maxD ? 1 : 0.75}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modelos más consultados vs stock, con alertas de desajuste. */
export function ModelsVsStock({
  rows,
}: {
  rows: SummaryResponse["modelsVsStock"];
}): JSX.Element {
  const max = Math.max(1, ...rows.map((r) => r.consultas));
  if (rows.length === 0) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-(--ink-2)">Todavía no hay modelos consultados en este período.</p>
      </div>
    );
  }
  return (
    <div className="card p-4">
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li key={r.modelo}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate font-semibold">{r.modelo}</span>
              <span className="tnum shrink-0 text-xs text-(--ink-2)">
                {r.consultas} consultas · {r.stock} en stock
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-(--surface-3)">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(3, (r.consultas / max) * 100)}%`,
                  background: r.stock === 0 ? "var(--danger)" : r.stock <= 1 ? "var(--warm)" : "var(--accent)",
                  transition: "width 200ms",
                }}
              />
            </div>
            {r.stock === 0 && (
              <p className="mt-1 text-xs font-semibold text-(--danger)">
                Piden mucho y no hay stock
              </p>
            )}
            {r.stock === 1 && (
              <p className="mt-1 text-xs font-semibold text-(--warm)">
                Alta demanda, 1 unidad
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Insights automáticos por reglas (deterministas). */
export function Insights({ items }: { items: SummaryResponse["insights"] }): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <section aria-label="Insights automáticos" data-secondary="true">
      <SectionTitle title="Qué te dicen los datos" hint="Frases generadas con reglas sobre tus números reales." />
      <ul className="flex flex-col gap-2">
        {items.map((ins, i) => (
          <li key={i} className="card flex items-start gap-2.5 p-3.5">
            <Lightbulb size={16} className="mt-0.5 shrink-0 text-(--warm)" aria-hidden="true" />
            <p className="text-sm">{ins.text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
