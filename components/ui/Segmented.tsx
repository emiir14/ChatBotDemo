"use client";

import type { JSX } from "react";
import { cn } from "@/lib/utils";

/**
 * Control segmentado canónico (selector de período, filtros de temperatura).
 * Mantiene una sola forma de mostrar opciones mutuamente excluyentes.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  /** null = ninguna opción activa (p. ej. rango personalizado). */
  value: T | null;
  onChange: (value: T) => void;
  ariaLabel: string;
  /** "solid": caja con opción activa en acento. "pills": chips redondeadas. */
  variant?: "solid" | "pills";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  variant = "solid",
  className,
}: SegmentedProps<T>): JSX.Element {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        variant === "solid"
          ? "inline-flex overflow-hidden rounded-lg border border-(--line)"
          : "flex flex-wrap gap-1.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-[36px] font-semibold transition-colors",
              variant === "solid"
                ? cn(
                    "px-2.5 text-[0.83rem] sm:px-3 sm:text-sm",
                    active ? "bg-(--accent) text-(--accent-ink)" : "text-(--ink-2) hover:bg-(--surface-3)",
                  )
                : cn(
                    "rounded-full px-3 text-xs font-bold",
                    active ? "bg-(--accent) text-(--accent-ink)" : "bg-(--surface-3) text-(--ink-2) hover:bg-(--line)",
                  ),
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
