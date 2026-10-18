"use client";

import type { JSX, ReactNode } from "react";
import { Flame, Snowflake, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Temperatura } from "./types";

/** Badge de temperatura: color + ícono + texto (nunca solo color). */
export function TempBadge({ value }: { value: Temperatura | null }): JSX.Element {
  if (value === "caliente") {
    return (
      <span className="badge badge-hot" title="Caliente: modelo concreto + presupuesto o pago + compra en menos de 30 días, o pidió visita, prueba o reserva">
        <Flame size={12} aria-hidden="true" /> Caliente
      </span>
    );
  }
  if (value === "tibio") {
    return (
      <span className="badge badge-warm" title="Tibio: interés definido pero faltan datos o compra a más de 30 días">
        <Thermometer size={12} aria-hidden="true" /> Tibio
      </span>
    );
  }
  if (value === "frio") {
    return (
      <span className="badge badge-cold" title="Frío: consulta general sin modelo ni urgencia, o solo precios sueltos">
        <Snowflake size={12} aria-hidden="true" /> Frío
      </span>
    );
  }
  return <span className="badge badge-neutral" title="El bot todavía no lo clasificó">Sin clasificar</span>;
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
      <Button
        variant="ghost"
        size="sm"
        className="mt-3"
        tooltip="Volver a intentar la carga"
        onClick={onRetry}
      >
        Reintentar
      </Button>
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

/** Diálogo de confirmación modal (para acciones destructivas). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}): JSX.Element {
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div className="card absolute left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-1 text-sm text-(--ink-2)">{message}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant={danger ? "danger" : "primary"}
            className="flex-1"
            disabled={busy}
            tooltip={confirmLabel}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" disabled={busy} tooltip="Cerrar sin hacer cambios" onClick={onCancel}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
