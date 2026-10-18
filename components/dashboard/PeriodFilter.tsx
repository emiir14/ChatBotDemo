"use client";

import type { JSX } from "react";
import { Segmented } from "@/components/ui/Segmented";
import type { PeriodKey } from "@/lib/metrics";

/**
 * Filtro de período estándar del panel: Hoy · 7 días · 30 días · Todo.
 * Fuente única de las etiquetas para que todas las secciones se vean igual.
 */
export const PERIOD_OPTIONS: ReadonlyArray<{ value: PeriodKey; label: string; title: string }> = [
  { value: "today", label: "Hoy", title: "Ver hoy" },
  { value: "7d", label: "7 días", title: "Ver los últimos 7 días" },
  { value: "30d", label: "30 días", title: "Ver los últimos 30 días" },
  { value: "all", label: "Todo", title: "Ver todo el historial" },
];

export function PeriodFilter({
  value,
  onChange,
  className,
}: {
  value: PeriodKey | null;
  onChange: (value: PeriodKey) => void;
  className?: string;
}): JSX.Element {
  return (
    <Segmented
      ariaLabel="Período"
      value={value}
      onChange={onChange}
      options={PERIOD_OPTIONS}
      className={className}
    />
  );
}
