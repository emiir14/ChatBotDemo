"use client";

import type { JSX } from "react";
import { Flame, Info, Snowflake, Thermometer, TrendingDown, TrendingUp, Minus } from "lucide-react";
import type { Temperatura, Variation } from "./types";

/** Badge de temperatura: color + ícono + texto (nunca solo color). */
export function TempBadge({ value }: { value: Temperatura | null }): JSX.Element {
  if (value === "caliente") {
    return (
      <span className="badge badge-hot">
        <Flame size={12} aria-hidden="true" /> Caliente
      </span>
    );
  }
  if (value === "tibio") {
    return (
      <span className="badge badge-warm">
        <Thermometer size={12} aria-hidden="true" /> Tibio
      </span>
    );
  }
  if (value === "frio") {
    return (
      <span className="badge badge-cold">
        <Snowflake size={12} aria-hidden="true" /> Frío
      </span>
    );
  }
  return <span className="badge badge-neutral">Sin clasificar</span>;
}

/** Variación vs período anterior (flecha + texto; "sin datos previos"). */
export function VariationLabel({ variation }: { variation: Variation | null }): JSX.Element {
  if (!variation) {
    return <span className="text-xs text-(--ink-3)">sin datos previos</span>;
  }
  const Icon = variation.pct === 0 ? Minus : variation.up ? TrendingUp : TrendingDown;
  const cls = variation.pct === 0 ? "text-(--ink-3)" : variation.up ? "text-(--ok)" : "text-(--danger)";
  const sign = variation.pct > 0 ? "+" : "";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${cls}`}>
      <Icon size={13} aria-hidden="true" />
      {sign}
      {Math.round(variation.pct)}% vs anterior
    </span>
  );
}

/** Título de sección con pregunta de negocio. */
export function SectionTitle({
  title,
  hint,
}: {
  title: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="mb-3">
      <h2 className="text-base font-bold tracking-tight">{title}</h2>
      {hint && <p className="text-sm text-(--ink-2)">{hint}</p>}
    </div>
  );
}

/** Tooltip "Cómo se calcula" con definición exacta. */
export function HowCalculated({ text }: { text: string }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-(--ink-3)" title={text}>
      <Info size={12} aria-hidden="true" />
      Cómo se calcula
    </span>
  );
}

/** Skeleton con la forma de una tarjeta de métrica. */
export function MetricSkeleton(): JSX.Element {
  return (
    <div className="card p-4" aria-hidden="true">
      <div className="skeleton w-24" />
      <div className="skeleton mt-2 h-8 w-20" />
      <div className="skeleton mt-2 w-32" />
    </div>
  );
}

/** Estado de error con reintentar (no tira abajo el panel). */
export function ErrorBox({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): JSX.Element {
  return (
    <div className="card p-5 text-center" role="alert">
      <p className="text-sm font-semibold">No se pudo cargar esta sección</p>
      <p className="mt-1 text-sm text-(--ink-2)">{message}</p>
      <button className="btn btn-ghost btn-sm mt-3" onClick={onRetry}>
        Reintentar
      </button>
    </div>
  );
}

/** Estado vacío útil. */
export function EmptyBox({ message }: { message: string }): JSX.Element {
  return (
    <div className="card p-6 text-center">
      <p className="text-sm text-(--ink-2)">{message}</p>
    </div>
  );
}
