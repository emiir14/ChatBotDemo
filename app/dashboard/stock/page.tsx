"use client";

import { useCallback, useEffect, useState, type JSX } from "react";
import useSWR from "swr";
import { Shell } from "@/components/dashboard/Header";
import { EmptyBox, ErrorBox, SectionTitle } from "@/components/dashboard/ui";
import {
  AddButton,
  EMPTY_FORM,
  EstadoButtons,
  StockAlert,
  VehicleModal,
  VehicleRow,
  type UIVehicle,
  type VehicleFormValue,
} from "@/components/dashboard/Stock";
import { ImportWizard } from "@/components/dashboard/ImportWizard";
import { timeAgo } from "@/lib/format";

interface StockResponse {
  vehicles: UIVehicle[];
  settings: { updated_at: string | null; stale_days: number };
}

interface MetaResponse {
  settings: { updated_at: string | null; stale_days: number };
  changes: Array<{ id: string; codigo: string | null; accion: string; detalle: string; actor: string; created_at: string }>;
}

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?next=/dashboard/stock";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}

const ACCION_LABEL: Record<string, string> = {
  alta: "Alta",
  edicion: "Edición",
  estado: "Cambio de estado",
  importacion: "Importación",
  reemplazo: "Reemplazo total",
  baja: "Baja",
};

function toForm(v: UIVehicle): VehicleFormValue {
  return {
    codigo: v.codigo,
    patente: v.patente ?? "",
    marca: v.marca,
    modelo: v.modelo,
    version: v.version,
    anio: v.anio,
    km: v.km,
    precio: v.precio,
    moneda: v.moneda,
    combustible: v.combustible,
    transmision: v.transmision,
    color: v.color,
    estado: v.estado,
    es_0km: v.es_0km,
    descripcion: v.descripcion,
  };
}

export default function StockPage(): JSX.Element {
  const { data, error, mutate } = useSWR<StockResponse>("/api/dashboard/stock", json);
  const { data: meta, mutate: mutateMeta } = useSWR<MetaResponse>("/api/dashboard/stock/meta", json);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; vehicle: UIVehicle } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = useCallback(() => {
    mutate();
    mutateMeta();
  }, [mutate, mutateMeta]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function submitForm(value: VehicleFormValue): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      const isEdit = modal && "vehicle" in modal;
      const res = await fetch(
        isEdit ? `/api/dashboard/stock/${(modal as { vehicle: UIVehicle }).vehicle.id}` : "/api/dashboard/stock",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value),
        },
      );
      const out = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "No se pudo guardar");
      setModal(null);
      setToast(isEdit ? "Auto actualizado" : "Auto agregado al stock");
      refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function quickEstado(v: UIVehicle, estado: UIVehicle["estado"]): Promise<void> {
    if (v.estado === estado) return;
    setBusyId(v.id);
    try {
      const res = await fetch(`/api/dashboard/stock/${v.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      if (!res.ok) throw new Error();
      setToast(`${v.codigo} → ${estado}`);
      refresh();
    } catch {
      setToast("No se pudo cambiar el estado");
    } finally {
      setBusyId(null);
    }
  }

  async function saveThreshold(days: number): Promise<void> {
    const res = await fetch("/api/dashboard/stock/meta", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stale_days: days }),
    });
    if (!res.ok) throw new Error();
    setToast("Umbral actualizado");
    refresh();
  }

  return (
    <Shell siteName="Stock" hasDemoData={false}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <a href="/dashboard" className="btn btn-ghost btn-sm">← Panel</a>
          <h1 className="text-xl font-bold tracking-tight">Gestión de stock</h1>
          <span className="tnum ml-auto text-sm text-(--ink-2)">
            {data ? `${data.vehicles.length} vehículos` : ""}
          </span>
        </div>

        <StockAlert
          updatedAt={data?.settings.updated_at ?? meta?.settings.updated_at ?? null}
          staleDays={data?.settings.stale_days ?? meta?.settings.stale_days ?? 4}
          onSaveThreshold={saveThreshold}
        />

        <ImportWizard onApplied={() => { refresh(); }} />

        <section aria-label="Vehículos">
          <SectionTitle title="Vehículos" hint="Editá cualquier auto o cambiá su estado con un toque." />
          <div className="mb-3">
            <AddButton onClick={() => { setFormError(null); setModal({ mode: "create" }); }} />
          </div>
          {error ? (
            <ErrorBox message="Revisá tu conexión." onRetry={() => mutate()} />
          ) : !data ? (
            <div className="card p-4" aria-label="Cargando stock">
              <div className="skeleton h-16" />
              <div className="skeleton mt-2 h-16" />
            </div>
          ) : data.vehicles.length === 0 ? (
            <EmptyBox message="No hay vehículos. Agregá el primero o subí un archivo." />
          ) : (
            <ul className="grid gap-2.5 md:grid-cols-2">
              {data.vehicles.map((v) => (
                <VehicleRow
                  key={v.id}
                  v={v}
                  busy={busyId === v.id}
                  onEdit={() => { setFormError(null); setModal({ mode: "edit", vehicle: v }); }}
                  onEstado={(e) => quickEstado(v, e)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Historial de cambios">
          <SectionTitle title="Historial" hint="Quién cambió qué y cuándo." />
          {!meta ? (
            <div className="card p-4" aria-hidden="true"><div className="skeleton h-10" /></div>
          ) : meta.changes.length === 0 ? (
            <EmptyBox message="Todavía no hay cambios registrados." />
          ) : (
            <ul className="card divide-y divide-(--line)">
              {meta.changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-baseline gap-x-2 px-3.5 py-2.5 text-sm">
                  <span className="badge badge-neutral">{ACCION_LABEL[c.accion] ?? c.accion}</span>
                  {c.codigo && <strong className="tnum">{c.codigo}</strong>}
                  <span className="min-w-0 flex-1 text-(--ink-2)">{c.detalle}</span>
                  <span className="tnum text-xs text-(--ink-3)">
                    {c.actor} · {timeAgo(c.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {modal && (
        <VehicleModal
          title={modal.mode === "create" ? "Agregar auto" : `Editar ${modal.vehicle.codigo}`}
          initial={modal.mode === "create" ? EMPTY_FORM : toForm(modal.vehicle)}
          lockCodigo={modal.mode === "edit"}
          saving={saving}
          error={formError}
          onClose={() => setModal(null)}
          onSubmit={submitForm}
        />
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 lg:bottom-4" aria-live="polite">
          <div className="toast" role="status"><span className="flex-1">{toast}</span></div>
        </div>
      )}
    </Shell>
  );
}
