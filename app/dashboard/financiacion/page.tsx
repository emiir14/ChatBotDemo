"use client";

import { useState, type FormEvent, type JSX } from "react";
import useSWR from "swr";
import { Pencil, Plus } from "lucide-react";
import { Shell } from "@/components/dashboard/Header";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyBox, ErrorBox, SectionTitle } from "@/components/dashboard/ui";
import type { FinancingOption } from "@/lib/financing";

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?next=/dashboard/financiacion";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}

interface FormValue {
  nombre: string;
  entidad: string;
  tna: string;
  cft: string;
  cuotas_min: string;
  cuotas_max: string;
  anticipo_min_pct: string;
  monto_max: string;
  requisitos: string;
  vigente_hasta: string;
  activo: boolean;
}

const EMPTY: FormValue = {
  nombre: "",
  entidad: "",
  tna: "",
  cft: "",
  cuotas_min: "",
  cuotas_max: "",
  anticipo_min_pct: "",
  monto_max: "",
  requisitos: "",
  vigente_hasta: "",
  activo: true,
};

function toForm(o: FinancingOption): FormValue {
  const num = (v: number | null): string => (v === null ? "" : String(v));
  return {
    nombre: o.nombre,
    entidad: o.entidad,
    tna: num(o.tna),
    cft: num(o.cft),
    cuotas_min: num(o.cuotas_min),
    cuotas_max: num(o.cuotas_max),
    anticipo_min_pct: num(o.anticipo_min_pct),
    monto_max: num(o.monto_max),
    requisitos: o.requisitos,
    vigente_hasta: o.vigente_hasta ?? "",
    activo: o.activo,
  };
}

function toPayload(f: FormValue): Record<string, unknown> {
  const num = (v: string): number | null => (v.trim() === "" ? null : Number(v));
  return {
    nombre: f.nombre.trim(),
    entidad: f.entidad.trim(),
    tna: num(f.tna),
    cft: num(f.cft),
    cuotas_min: num(f.cuotas_min),
    cuotas_max: num(f.cuotas_max),
    anticipo_min_pct: num(f.anticipo_min_pct),
    monto_max: num(f.monto_max),
    requisitos: f.requisitos.trim(),
    vigente_hasta: f.vigente_hasta || null,
    activo: f.activo,
  };
}

function termsLine(o: FinancingOption): string {
  const parts: string[] = [];
  if (o.tna !== null) parts.push(`TNA ${o.tna}%`);
  if (o.cft !== null) parts.push(`CFT ${o.cft}%`);
  if (o.cuotas_min !== null || o.cuotas_max !== null) {
    parts.push(
      o.cuotas_min === o.cuotas_max
        ? `${o.cuotas_min} cuotas`
        : `${o.cuotas_min ?? "?"} a ${o.cuotas_max ?? "?"} cuotas`,
    );
  }
  if (o.anticipo_min_pct !== null) parts.push(`anticipo ${o.anticipo_min_pct}%`);
  return parts.join(" · ") || "Ver condiciones";
}

export default function FinanciacionPage(): JSX.Element {
  const { data, error, mutate } = useSWR<{ items: FinancingOption[] }>(
    "/api/dashboard/financing",
    json,
  );
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; item: FinancingOption } | null>(null);
  const [form, setForm] = useState<FormValue>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function openCreate(): void {
    setForm(EMPTY);
    setFormError(null);
    setModal({ mode: "create" });
  }
  function openEdit(item: FinancingOption): void {
    setForm(toForm(item));
    setFormError(null);
    setModal({ mode: "edit", item });
  }

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!form.nombre.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = modal && "item" in modal;
      const res = await fetch(
        isEdit ? `/api/dashboard/financing/${(modal as { item: FinancingOption }).item.id}` : "/api/dashboard/financing",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toPayload(form)),
        },
      );
      const out = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "No se pudo guardar");
      setModal(null);
      setToast(isEdit ? "Plan actualizado. El bot ya lo cita." : "Plan agregado. El bot ya lo cita.");
      mutate();
      window.setTimeout(() => setToast(null), 4000);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(item: FinancingOption): Promise<void> {
    await fetch(`/api/dashboard/financing/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: !item.activo }),
    });
    mutate();
  }

  const set = (k: keyof FormValue, v: string | boolean): void =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Shell siteName="Financiación">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/dashboard" variant="ghost" size="sm" tooltip="Volver al panel general">
            ← Panel
          </ButtonLink>
          <h1 className="text-xl font-bold tracking-tight">Planes de financiación</h1>
        </div>

        <section aria-label="Cómo funciona" className="card p-3.5 text-sm text-(--ink-2)">
          Lo que esté <strong>activo y vigente</strong> lo cita el bot con números exactos.
          Lo vencido o inactivo lo deriva al asesor. Vienen 3 planes de ejemplo: editalos con tus convenios reales.
        </section>

        <div>
          <Button variant="primary" onClick={openCreate} tooltip="Agregar un plan de financiación">
            <Plus size={16} aria-hidden="true" /> Agregar plan
          </Button>
        </div>

        {error ? (
          <ErrorBox message="Revisá tu conexión." onRetry={() => mutate()} />
        ) : !data ? (
          <div className="card p-4" aria-label="Cargando planes">
            <div className="skeleton h-16" />
            <div className="skeleton mt-2 h-16" />
          </div>
        ) : data.items.length === 0 ? (
          <EmptyBox message="No hay planes. Agregá el primero para que el bot pueda citar financiación." />
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {data.items.map((o) => (
              <li key={o.id} className={`card p-3.5 ${o.activo ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold leading-snug">
                      {o.nombre}
                      {o.entidad && <span className="font-normal text-(--ink-2)"> · {o.entidad}</span>}
                    </p>
                    <p className="tnum mt-0.5 text-sm text-(--ink-2)">{termsLine(o)}</p>
                    {o.vigente_hasta ? (
                      <p className="mt-1 text-xs text-(--ink-2)">Vigente hasta {o.vigente_hasta}</p>
                    ) : (
                      <p className="mt-1 text-xs text-(--ink-2)">Sin vencimiento</p>
                    )}
                    {o.requisitos && <p className="mt-1 text-xs text-(--ink-2)">{o.requisitos}</p>}
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => openEdit(o)} aria-label={`Editar ${o.nombre}`} tooltip="Editar plan">
                    <Pencil size={14} aria-hidden="true" /> Editar
                  </Button>
                </div>
                <Button
                  variant={o.activo ? "primary" : "solid"}
                  size="xs"
                  className="mt-2.5"
                  aria-pressed={o.activo}
                  onClick={() => toggle(o)}
                  tooltip={o.activo ? "Desactivar: el bot deja de citarlo" : "Activar: el bot lo cita"}
                >
                  {o.activo ? "Activo · lo cita el bot" : "Inactivo"}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {modal && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label={modal.mode === "create" ? "Agregar plan" : "Editar plan"}>
          <div className="absolute inset-0 bg-black/40" onClick={() => setModal(null)} aria-hidden="true" />
          <div className="absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-2xl bg-(--surface) p-4 sm:inset-10 sm:rounded-2xl lg:inset-x-auto lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2">
            <h2 className="mb-3 text-lg font-bold">{modal.mode === "create" ? "Agregar plan" : "Editar plan"}</h2>
            <form className="grid grid-cols-2 gap-2.5" onSubmit={submit}>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                Nombre*
                <input className="input" value={form.nombre} required maxLength={120} placeholder="12 cuotas fijas"
                  onChange={(e) => set("nombre", e.target.value)} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                Entidad (banco o fábrica)
                <input className="input" value={form.entidad} maxLength={120} placeholder="Banco Nación"
                  onChange={(e) => set("entidad", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                TNA %
                <input className="input tnum" type="number" min={0} step="any" placeholder="27"
                  value={form.tna} onChange={(e) => set("tna", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                CFT %
                <input className="input tnum" type="number" min={0} step="any" placeholder="45.2"
                  value={form.cft} onChange={(e) => set("cft", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Cuotas desde
                <input className="input tnum" type="number" min={1} value={form.cuotas_min}
                  onChange={(e) => set("cuotas_min", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Cuotas hasta
                <input className="input tnum" type="number" min={1} value={form.cuotas_max}
                  onChange={(e) => set("cuotas_max", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Anticipo mín %
                <input className="input tnum" type="number" min={0} max={100} value={form.anticipo_min_pct}
                  onChange={(e) => set("anticipo_min_pct", e.target.value)} />
              </label>
              <label className="flex flex-col gap-1 text-xs font-semibold">
                Monto máx $
                <input className="input tnum" type="number" min={1} value={form.monto_max}
                  onChange={(e) => set("monto_max", e.target.value)} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                Vigente hasta
                <input className="input" type="date" value={form.vigente_hasta}
                  onChange={(e) => set("vigente_hasta", e.target.value)} />
              </label>
              <label className="col-span-2 flex flex-col gap-1 text-xs font-semibold">
                Requisitos
                <input className="input" value={form.requisitos} maxLength={500} placeholder="Recibo de sueldo…"
                  onChange={(e) => set("requisitos", e.target.value)} />
              </label>
              <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-sm">
                <input type="checkbox" checked={form.activo} className="h-5 w-5 accent-(--accent)"
                  onChange={(e) => set("activo", e.target.checked)} />
                Activo (el bot lo cita)
              </label>
              {formError && <p role="alert" className="col-span-2 text-sm font-semibold text-(--danger)">{formError}</p>}
              <div className="col-span-2 flex gap-2">
                <Button type="submit" variant="primary" className="flex-1" disabled={saving} tooltip="Guardar el plan de financiación">
                  {saving ? "Guardando…" : "Guardar"}
                </Button>
                <Button variant="ghost" tooltip="Cerrar sin guardar" onClick={() => setModal(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 lg:bottom-4" aria-live="polite">
          <div className="toast" role="status"><span className="flex-1">{toast}</span></div>
        </div>
      )}
    </Shell>
  );
}
