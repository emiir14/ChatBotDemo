"use client";

import { useState, type JSX } from "react";
import { AlertTriangle, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { daysSince, formatMoney, splitColors, timeAgo } from "@/lib/format";
import { StaleThresholdForm } from "./StaleThresholdForm";

export interface UIVehicle {
  id: string;
  codigo: string;
  patente: string | null;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  km: number;
  precio: number;
  moneda: string;
  combustible: string;
  transmision: string;
  color: string;
  estado: "disponible" | "reservado" | "vendido";
  es_0km: boolean;
  descripcion: string;
}

const ESTADOS = [
  { key: "disponible", label: "Disponible" },
  { key: "reservado", label: "Reservado" },
  { key: "vendido", label: "Vendido" },
] as const;

/** Botones rápidos de estado (táctiles, mobile-first). */
export function EstadoButtons({
  value,
  onChange,
  disabled,
}: {
  value: UIVehicle["estado"];
  onChange: (e: UIVehicle["estado"]) => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <div className="flex gap-1" role="group" aria-label="Estado del vehículo">
      {ESTADOS.map((e) => (
        <button
          key={e.key}
          type="button"
          disabled={disabled}
          aria-pressed={value === e.key}
          onClick={() => onChange(e.key)}
          className={`min-h-[36px] flex-1 rounded-md px-2 text-xs font-bold transition-colors sm:flex-none sm:px-3 ${
            value === e.key
              ? e.key === "disponible"
                ? "bg-(--accent) text-(--accent-ink)"
                : e.key === "reservado"
                  ? "bg-(--warm) text-white"
                  : "bg-(--cold) text-white"
              : "bg-(--surface-3) text-(--ink-2)"
          }`}
        >
          {e.label}
        </button>
      ))}
    </div>
  );
}

/** Alerta de stock desactualizado + editor de umbral. */
export function StockAlert({
  updatedAt,
  staleDays,
  onSaveThreshold,
}: {
  updatedAt: string | null;
  staleDays: number;
  onSaveThreshold: (days: number) => Promise<void>;
}): JSX.Element {
  const daysSinceUpdate = daysSince(updatedAt);
  const stale = daysSinceUpdate !== null && daysSinceUpdate > staleDays;

  return (
    <div className={`card flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center ${stale ? "border-(--warm)" : ""}`}>
      {stale ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-(--warm)" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          El stock lleva {Math.floor(daysSinceUpdate ?? 0)} días sin actualizarse. El bot avisa a los clientes que la disponibilidad puede haber cambiado.
        </p>
      ) : (
        <p className="text-sm text-(--ink-2)">
          Stock actualizado {updatedAt ? timeAgo(updatedAt) : "nunca"}.
        </p>
      )}
      <StaleThresholdForm
        idPrefix="stale-days-stock"
        initialDays={staleDays}
        onSave={onSaveThreshold}
      />
    </div>
  );
}

export interface VehicleFormValue {
  codigo: string;
  patente: string;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  km: number;
  precio: number;
  moneda: string;
  combustible: string;
  transmision: string;
  color: string;
  estado: UIVehicle["estado"];
  es_0km: boolean;
  descripcion: string;
}

export const EMPTY_FORM: VehicleFormValue = {
  codigo: "",
  patente: "",
  marca: "",
  modelo: "",
  version: "",
  anio: new Date().getFullYear(),
  km: 0,
  precio: 0,
  moneda: "ARS",
  combustible: "Nafta",
  transmision: "Manual",
  color: "",
  estado: "disponible",
  es_0km: false,
  descripcion: "",
};

/** Modal de alta/edición (pantalla completa en móvil). */
export function VehicleModal({
  title,
  initial,
  lockCodigo,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: VehicleFormValue;
  lockCodigo: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (v: VehicleFormValue) => void;
}): JSX.Element {
  const [form, setForm] = useState<VehicleFormValue>(initial);
  const set = (k: keyof VehicleFormValue, v: string | number | boolean): void =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-2xl bg-(--surface) p-4 sm:inset-10 sm:rounded-2xl lg:inset-x-auto lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2">
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        <form
          className="grid grid-cols-2 gap-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          onKeyDown={(e) => {
            // Enter no debe enviar el formulario: se guarda solo con el botón
            // "Guardar". Salvo dentro de un textarea, donde hace salto de línea.
            if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement)) {
              e.preventDefault();
            }
          }}
        >
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Código interno*
            <input className="input" value={form.codigo} disabled={lockCodigo} required maxLength={30}
              onChange={(e) => set("codigo", e.target.value.toUpperCase().replace(/\s/g, ""))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Patente
            <input className="input" value={form.patente} maxLength={12} placeholder="AA123BB"
              onChange={(e) => set("patente", e.target.value.toUpperCase())} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Marca*
            <input className="input" value={form.marca} required onChange={(e) => set("marca", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Modelo*
            <input className="input" value={form.modelo} required onChange={(e) => set("modelo", e.target.value)} />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
            Versión
            <input className="input" value={form.version} onChange={(e) => set("version", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Año*
            <input className="input tnum" type="number" min={1990} max={new Date().getFullYear() + 1}
              value={form.anio} required onChange={(e) => set("anio", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Km
            <input className="input tnum" type="number" min={0} value={form.km}
              onChange={(e) => set("km", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Precio*
            <input className="input tnum" type="number" min={1} step="any" value={form.precio || ""}
              required onChange={(e) => set("precio", Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Moneda
            <select className="select" value={form.moneda} onChange={(e) => set("moneda", e.target.value)}>
              <option value="ARS">ARS</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Combustible
            <input className="input" value={form.combustible} onChange={(e) => set("combustible", e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold">
            Transmisión
            <select className="select" value={form.transmision} onChange={(e) => set("transmision", e.target.value)}>
              <option>Manual</option>
              <option>Automática</option>
            </select>
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
            Colores
            <input className="input" value={form.color} maxLength={120}
              placeholder="Blanco, Negro, Gris (separá con comas)"
              onChange={(e) => set("color", e.target.value)} />
            <span className="text-[0.7rem] font-normal text-(--ink-2)">
              Podés cargar varios colores separados por coma. El bot se los lista al cliente.
            </span>
          </label>
          <div className="flex flex-col gap-1 text-xs font-semibold">
            Estado
            <EstadoButtons value={form.estado} onChange={(e) => set("estado", e)} />
          </div>
          <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
            Descripción
            <textarea
              className="textarea"
              rows={3}
              value={form.descripcion}
              maxLength={500}
              onChange={(e) => set("descripcion", e.target.value)}
            />
          </label>
          <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-sm">
            <input type="checkbox" checked={form.es_0km} className="h-5 w-5 accent-(--accent)"
              onChange={(e) => set("es_0km", e.target.checked)} />
            Es 0 km
          </label>
          {error && <p role="alert" className="col-span-2 text-sm font-semibold text-(--danger)">{error}</p>}
          <div className="col-span-2 flex gap-2">
            <Button variant="primary" type="submit" className="flex-1" disabled={saving} tooltip="Guardar los datos del auto">
              {saving ? "Guardando…" : "Guardar"}
            </Button>
            <Button variant="ghost" tooltip="Cerrar sin guardar" onClick={onClose}>
              Cancelar
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Fila/tarjeta de vehículo con acciones. */
export function VehicleRow({
  v,
  onEdit,
  onEstado,
  onDelete,
  busy,
}: {
  v: UIVehicle;
  onEdit: () => void;
  onEstado: (e: UIVehicle["estado"]) => void;
  onDelete: () => void;
  busy: boolean;
}): JSX.Element {
  const colors = splitColors(v.color);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="card p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold leading-snug">
            {v.marca} {v.modelo} <span className="font-normal text-(--ink-2)">{v.version}</span>
          </p>
          <p className="tnum mt-0.5 text-sm text-(--ink-2)">
            {v.codigo}
            {v.patente ? ` · ${v.patente}` : ""} · {v.anio} ·{" "}
            {v.es_0km ? "0 km" : `${new Intl.NumberFormat("es-AR").format(v.km)} km`}
          </p>
          {colors.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {colors.map((c) => (
                <span key={c} className="rounded-full bg-(--surface-3) px-2 py-0.5 text-[0.7rem] text-(--ink-2)">
                  {c}
                </span>
              ))}
            </p>
          )}
          <p className="tnum mt-1 text-lg font-bold">{formatMoney(v.precio, v.moneda)}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Editar ${v.codigo}`} tooltip="Editar todos los datos del auto">
            <Pencil size={14} aria-hidden="true" /> Editar
          </Button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <Button variant="danger" size="sm" disabled={busy} tooltip="Confirmar la baja del vehículo" onClick={onDelete}>
                Sí, eliminar
              </Button>
              <Button variant="ghost" size="sm" disabled={busy} tooltip="Cancelar la baja" onClick={() => setConfirming(false)}>
                No
              </Button>
            </span>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setConfirming(true)} aria-label={`Eliminar ${v.codigo}`} tooltip="Eliminar este vehículo del stock">
              <Trash2 size={14} aria-hidden="true" /> Eliminar
            </Button>
          )}
        </div>
      </div>
      <div className="mt-2.5">
        <EstadoButtons value={v.estado} onChange={onEstado} disabled={busy} />
      </div>
    </li>
  );
}

export function AddButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <Button variant="primary" tooltip="Cargar un auto nuevo al stock" onClick={onClick}>
      <Plus size={16} aria-hidden="true" /> Agregar auto
    </Button>
  );
}
