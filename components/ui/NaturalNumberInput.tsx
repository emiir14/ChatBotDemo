"use client";

import type { ChangeEvent, JSX } from "react";
import { cn } from "@/lib/utils";

/** Deja solo dígitos y saca ceros a la izquierda: "00008" -> "8", "a1b2" -> "12". */
export function naturalDigits(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^0+/, "");
}

export interface NaturalNumberInputProps {
  value: number | "";
  onValueChange: (value: number | "") => void;
  min?: number;
  max?: number;
  id?: string;
  className?: string;
  ariaLabel?: string;
}

/**
 * Campo de número natural (entero positivo): filtra en vivo lo que no sea
 * dígito, elimina ceros a la izquierda y recorta al rango [min, max].
 * Evita entradas como "00008" o letras.
 */
export function NaturalNumberInput({
  value,
  onValueChange,
  min = 1,
  max = 30,
  id,
  className,
  ariaLabel,
}: NaturalNumberInputProps): JSX.Element {
  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    const digits = naturalDigits(e.target.value);
    if (digits === "") {
      onValueChange("");
      return;
    }
    const n = Number(digits);
    onValueChange(Math.min(max, Math.max(min, n)));
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      value={value === "" ? "" : String(value)}
      onChange={handleChange}
      aria-label={ariaLabel}
      className={cn("input tnum w-14", className)}
      style={{ minHeight: 30, fontSize: "0.8rem" }}
    />
  );
}
