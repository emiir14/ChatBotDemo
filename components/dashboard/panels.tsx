"use client";

import { Fragment, useMemo, type JSX } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { Lightbulb } from "lucide-react";
import { HowCalculated, SectionTitle, VariationLabel } from "./ui";
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

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  variation?: { pct: number; up: boolean } | null;
  how: string;
  spark?: Array<{ day: string; n: number }>;
  big?: boolean;
}

/** Tarjeta de métrica: valor grande, contexto, sparkline, definición. */
export function MetricCard({ label, value, sub, variation, how, spark, big }: MetricCardProps): JSX.Element {
  return (
    <div className="card flex flex-col gap-1 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.8rem] font-semibold text-(--ink-2)">{label}</p>
      </div>
      <p className={`tnum font-bold tracking-tight ${big ? "text-3xl" : "text-2xl"}`}>{value}</p>
      {sub && <p className="text-xs text-(--ink-2)">{sub}</p>}
      {variation !== undefined && <VariationLabel variation={variation ?? null} />}
      {spark && <Sparkline data={spark} />}
      <HowCalculated text={how} />
    </div>
  );
}

/** Embudo horizontal simple con % de paso. */
export function Funnel({ steps }: { steps: SummaryResponse["funnel"] }): JSX.Element {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <div className="card p-4" role="img" aria-label={`Embudo: ${steps.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <div className="flex flex-col gap-3">
        {steps.map((s) => (
          <div key={s.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
              <span className="font-semibold">{s.label}</span>
              <span className="tnum">
                <strong>{s.value}</strong>
                {s.conversionFromPrev !== null && (
                  <span className="ml-2 text-xs text-(--ink-2)">
                    {Math.round(s.conversionFromPrev)}% del paso anterior
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

/** Mapa de calor día × hora (grilla CSS). Franjas fuera de horario sombreadas. */
export function Heatmap({ cells }: { cells: SummaryResponse["heatmap"] }): JSX.Element {
  const byCell = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) m.set(`${c.dow}-${c.hour}`, Number(c.n));
    return m;
  }, [cells]);
  const max = useMemo(() => Math.max(1, ...cells.map((c) => Number(c.n))), [cells]);
  const hours = useMemo(() => Array.from({ length: 24 }, (_, h) => h), []);
  const days = [1, 2, 3, 4, 5, 6, 7];

  const isOff = (dow: number, h: number): boolean =>
    dow === 7 || (dow === 6 && (h < 9 || h >= 13)) || (dow <= 5 && (h < 9 || h >= 18));

  const colorFor = (n: number): string => {
    if (n === 0) return "var(--surface-3)";
    const t = n / max;
    // Verde acento con intensidad por volumen (coherente con tokens).
    return `color-mix(in srgb, var(--accent) ${Math.round(25 + t * 75)}%, var(--surface-3))`;
  };

  return (
    <div className="card overflow-x-auto p-4">
      <div className="min-w-[560px]">
        <div className="grid" style={{ gridTemplateColumns: "52px repeat(24, 1fr)" }} role="img"
          aria-label="Mapa de calor de consultas por día y hora">
          <div />
          {hours.map((h) => (
            <div key={h} className="pb-1 text-center text-[0.62rem] text-(--ink-3)">
              {h % 3 === 0 ? `${h}h` : ""}
            </div>
          ))}
          {days.map((d) => (
            <Fragment key={d}>
              <div key={`lbl-${d}`} className="py-0.5 pr-2 text-right text-[0.7rem] font-semibold capitalize text-(--ink-2)">
                {diaNombre(d).slice(0, 3)}
              </div>
              {hours.map((h) => {
                const n = byCell.get(`${d}-${h}`) ?? 0;
                return (
                  <div key={`${d}-${h}`} className="p-[1.5px]" title={`${diaNombre(d)} ${h}hs: ${n} consultas${isOff(d, h) ? " (fuera de horario)" : ""}`}>
                    <div
                      className="heat-cell"
                      style={{
                        background: colorFor(n),
                        outline: isOff(d, h) ? "1px dashed var(--ink-3)" : undefined,
                        outlineOffset: -1,
                      }}
                    />
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
        <p className="mt-2 text-xs text-(--ink-3)">
          Celdas con borde punteado = fuera de horario comercial. Más intenso = más consultas.
        </p>
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
              <span className="font-semibold">{r.modelo}</span>
              <span className="tnum text-xs text-(--ink-2)">
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
