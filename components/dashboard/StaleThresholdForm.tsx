"use client";

import { useState, type FormEvent, type JSX } from "react";
import { Button } from "@/components/ui/Button";
import { NaturalNumberInput } from "@/components/ui/NaturalNumberInput";

/** Límite natural del umbral de la alerta de stock (días). */
export const STALE_DAYS_MIN = 1;
export const STALE_DAYS_MAX = 30;

/**
 * Formulario único del umbral de la alerta de stock ("Alertar a los N días").
 * Centraliza el filtro de número natural y la validación para reusarlo en el
 * panel y en la página de Stock.
 */
export function StaleThresholdForm({
  initialDays,
  onSave,
  onError,
  idPrefix = "stale-days",
}: {
  initialDays: number;
  onSave: (days: number) => void | Promise<void>;
  onError?: (message: string) => void;
  idPrefix?: string;
}): JSX.Element {
  const [value, setValue] = useState<number | "">(initialDays);
  const [saving, setSaving] = useState(false);
  const inputId = `${idPrefix}-input`;

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    const n = value === "" ? null : value;
    if (
      n === null ||
      !Number.isInteger(n) ||
      n < STALE_DAYS_MIN ||
      n > STALE_DAYS_MAX
    ) {
      onError?.(`Umbral inválido (${STALE_DAYS_MIN} a ${STALE_DAYS_MAX} días)`);
      return;
    }
    setSaving(true);
    try {
      await onSave(n);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      title="Cambiar a los cuántos días se muestra esta alerta"
      onSubmit={submit}
    >
      <div className="flex items-center gap-1.5">
        <label htmlFor={inputId} className="whitespace-nowrap text-xs text-(--ink-2)">
          Alertar a los
        </label>
        <NaturalNumberInput
          id={inputId}
          value={value}
          onValueChange={setValue}
          min={STALE_DAYS_MIN}
          max={STALE_DAYS_MAX}
          ariaLabel="Días sin actualizar para alertar"
        />
        <span className="text-xs text-(--ink-2)">días</span>
      </div>
      <Button
        type="submit"
        variant="ghost"
        size="xs"
        disabled={saving}
        title="Guardar a los cuántos días aparece esta alerta"
      >
        Guardar umbral
      </Button>
    </form>
  );
}
