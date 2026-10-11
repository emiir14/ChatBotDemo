"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type JSX, type ReactNode } from "react";
import { Sparkline } from "./panels";
import { timeAgo } from "@/lib/format";
import type { ActivityItem } from "@/lib/activity";

/** Número que cuenta hacia arriba al aparecer (respeta reduced-motion). */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }): JSX.Element {
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(reduce ? value : 0);
  const raf = useRef(0);
  useEffect(() => {
    if (reduce) {
      setDisplay(value);
      return;
    }
    const from = 0;
    const start = performance.now();
    const dur = 700;
    const tick = (t: number): void => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, reduce]);
  return <span className="tnum">{format(display)}</span>;
}

/** Entrada escalonada para tarjetas. */
export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }): JSX.Element {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      {children}
    </motion.div>
  );
}

interface KpiProps {
  icon: ReactNode;
  tint: string;
  label: string;
  value: number;
  format: (n: number) => string;
  /** Si viene texto, se muestra en vez del número animado. */
  text?: string;
  sub?: string;
  spark?: Array<{ day: string; n: number }>;
  delay?: number;
  /** Tono del número (default: tinta). */
  tone?: "ink" | "green";
}

/** Tarjeta KPI: chip de ícono, número animado y sparkline. */
export function KpiCard({ icon, tint, label, value, format, text, sub, spark, delay = 0, tone = "ink" }: KpiProps): JSX.Element {
  return (
    <FadeIn delay={delay}>
      <div className="card flex h-full flex-col gap-1 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: tint }} aria-hidden="true">
            {icon}
          </span>
          <p className="text-[0.78rem] font-bold uppercase tracking-wide text-(--ink-2)">{label}</p>
        </div>
        {text !== undefined ? (
          <p className="truncate text-[1.4rem] font-bold leading-tight tracking-tight" title={`${label}: ${text}`}>
            {text}
          </p>
        ) : (
          <p className={`text-[1.7rem] font-bold leading-none tracking-tight ${tone === "green" ? "text-(--ok)" : ""}`} title={`${label}: ${format(value)}`}>
            <CountUp value={value} format={format} />
          </p>
        )}
        {sub && <span className="text-[0.72rem] text-(--ink-2)">{sub}</span>}
        {spark && spark.length > 1 && <Sparkline data={spark} />}
      </div>
    </FadeIn>
  );
}

/** Encabezado de sección con chip de ícono (separa visualmente). */
export function SectionHead({
  icon,
  tint,
  title,
  hint,
  action,
}: {
  icon: ReactNode;
  tint: string;
  title: string;
  hint?: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: tint }} aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[1.02rem] font-bold tracking-tight">{title}</h2>
        {hint && <p className="text-sm text-(--ink-2)">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

const ACT_ICON: Record<ActivityItem["kind"], string> = {
  nuevo_lead: "bg-(--accent-soft)",
  mensaje_cliente: "bg-(--cold-soft)",
  respuesta_bot: "bg-(--surface-3)",
  derivado: "bg-(--hot-soft)",
};

/** Feed de actividad en vivo. */
export function ActivityFeed({ items, onOpen }: { items: ActivityItem[]; onOpen: (id: string) => void }): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="card p-5 text-center">
        <p className="text-sm text-(--ink-2)">Todavía no hay actividad en este período.</p>
      </div>
    );
  }
  return (
    <ul className="card divide-y divide-(--line)" aria-label="Actividad reciente">
      {items.map((a) => (
        <li key={a.id}>
          <button onClick={() => onOpen(a.leadId)} className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-(--surface-3)">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${ACT_ICON[a.kind]}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-sm">{a.text}</span>
            <span className="tnum shrink-0 text-xs text-(--ink-3)">{timeAgo(a.at)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
