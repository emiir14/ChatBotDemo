"use client";

import { useState, type JSX } from "react";
import useSWR from "swr";
import {
  Check,
  Clock,
  MessageCircle,
  PackageCheck,
  RotateCcw,
} from "lucide-react";
import { Shell } from "@/components/dashboard/Header";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyBox, ErrorBox } from "@/components/dashboard/ui";
import { formatPhone, timeAgo } from "@/lib/format";
import type {
  StockAlertItem,
  StockAlertsResponse,
  StockDemandEstado,
} from "@/components/dashboard/types";

type Filter = "abiertas" | StockDemandEstado;

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?next=/dashboard/alertas";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) {
    const out = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(out.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: "abiertas", label: "Abiertas" },
  { key: "disponible", label: "Nuevas" },
  { key: "pendiente", label: "Esperando stock" },
  { key: "descartado", label: "Descartadas" },
];

const STATE_BADGE: Record<StockDemandEstado, { label: string; className: string }> = {
  disponible: { label: "Ya disponible", className: "badge badge-hot" },
  pendiente: { label: "Esperando stock", className: "badge badge-neutral" },
  descartado: { label: "Descartada", className: "badge badge-neutral" },
};

function vehicleLine(item: StockAlertItem): string | null {
  if (!item.vehicle) return null;
  const v = item.vehicle;
  return [v.marca, v.modelo, v.version].filter(Boolean).join(" ") + ` · ${v.anio}`;
}

function AlertCard({
  item,
  busy,
  onDismiss,
  onRestore,
}: {
  item: StockAlertItem;
  busy: boolean;
  onDismiss: (id: string) => void;
  onRestore: (id: string) => void;
}): JSX.Element {
  const badge = STATE_BADGE[item.estado];
  const nombre = item.lead?.nombre?.trim() || "Sin nombre";
  const telefono = formatPhone(item.lead?.telefono);
  const vehiculo = vehicleLine(item);

  return (
    <li className="card p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className={badge.className}>{badge.label}</span>
          <p className="mt-1.5 text-base font-bold leading-snug">{item.item_label}</p>
          <p className="mt-0.5 text-sm text-(--ink-2)">
            {nombre} · <span className="tnum">{telefono}</span>
          </p>
        </div>
        <span className="tnum shrink-0 text-xs text-(--ink-3)">
          {item.estado === "disponible" && item.resolved_at
            ? `Ingresó ${timeAgo(item.resolved_at)}`
            : `Consultó ${timeAgo(item.asked_at)}`}
        </span>
      </div>

      {item.estado === "disponible" && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-(--ink-2)">
          <PackageCheck size={15} aria-hidden="true" />
          {vehiculo ? `Entró al stock: ${vehiculo}` : "El ítem ya está en el stock."}
        </p>
      )}
      {item.estado === "pendiente" && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-(--ink-2)">
          <Clock size={15} aria-hidden="true" />
          Todavía no hay stock. Te avisamos cuando ingrese.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {item.lead && (
          <ButtonLink
            href={`/dashboard?lead=${item.lead_id}`}
            variant="primary"
            size="sm"
            tooltip="Abrir la conversación donde se preguntó por este ítem"
          >
            <MessageCircle size={15} aria-hidden="true" /> Ver conversación
          </ButtonLink>
        )}
        {item.estado === "descartado" ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onRestore(item.id)}
            tooltip="Volver a mostrar la alerta"
          >
            <RotateCcw size={15} aria-hidden="true" /> Restaurar
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onDismiss(item.id)}
            tooltip="Marcar como atendida: deja de contar en el badge"
          >
            <Check size={15} aria-hidden="true" /> Descartar
          </Button>
        )}
      </div>
    </li>
  );
}

export default function AlertasPage(): JSX.Element {
  const [filter, setFilter] = useState<Filter>("abiertas");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissingAll, setDismissingAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data, error, mutate } = useSWR<StockAlertsResponse>(
    `/api/dashboard/alerts?estado=${filter}`,
    json,
    { refreshInterval: 30000 },
  );

  function showToast(message: string): void {
    setToast(message);
    window.setTimeout(() => setToast(null), 5000);
  }

  async function update(
    body: Record<string, unknown>,
    id: string | null,
  ): Promise<void> {
    setBusyId(id);
    try {
      const res = await fetch("/api/dashboard/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const out = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(out.error ?? "No se pudo actualizar");
      await mutate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudo actualizar");
    } finally {
      setBusyId(null);
    }
  }

  async function dismissAll(): Promise<void> {
    setDismissingAll(true);
    try {
      const res = await fetch("/api/dashboard/alerts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss_all" }),
      });
      const out = (await res.json()) as { error?: string; updated?: number };
      if (!res.ok) throw new Error(out.error ?? "No se pudieron descartar");
      showToast(
        out.updated
          ? `Se descartaron ${out.updated} alertas.`
          : "No había alertas nuevas para descartar.",
      );
      await mutate();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "No se pudieron descartar");
    } finally {
      setDismissingAll(false);
    }
  }

  const counts = data?.counts ?? { disponible: 0, pendiente: 0, descartado: 0 };
  const items = data?.items ?? [];

  function countFor(key: Filter): number | null {
    if (key === "abiertas") return counts.disponible + counts.pendiente;
    return counts[key];
  }

  return (
    <Shell siteName="Alertas">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-16 pt-5">
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/dashboard" variant="ghost" size="sm" tooltip="Volver al panel general">
            ← Panel
          </ButtonLink>
          <h1 className="text-xl font-bold tracking-tight">Alertas de stock</h1>
        </div>

        <section aria-label="Cómo funciona" className="card p-3.5 text-sm text-(--ink-2)">
          Cuando un cliente pregunta por un auto que <strong>no está en stock</strong>, el bot
          guarda el pedido. Si ese ítem ingresa al stock, aparece acá con la conversación
          donde se preguntó, para que puedas avisarle.
        </section>

        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => {
            const count = countFor(f.key);
            return (
              <Button
                key={f.key}
                variant={filter === f.key ? "primary" : "ghost"}
                size="sm"
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
                tooltip={
                  f.key === "abiertas"
                    ? "Alertas nuevas y pedidos esperando stock"
                    : f.key === "disponible"
                      ? "Ítems pedidos que ya entraron al stock"
                      : f.key === "pendiente"
                        ? "Ítems pedidos que todavía no tienen stock"
                        : "Alertas que ya descartaste"
                }
              >
                {f.label}
                {count !== null && count > 0 && (
                  <span className="ml-1 rounded-full bg-black/10 px-1.5 text-xs tnum dark:bg-white/15">
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
          {counts.disponible > 0 && (
            <Button
              variant="solid"
              size="sm"
              className="ml-auto"
              disabled={dismissingAll}
              onClick={dismissAll}
              tooltip="Marcar todas las alertas nuevas como atendidas"
            >
              <Check size={15} aria-hidden="true" />
              {dismissingAll ? "Descartando…" : "Descartar nuevas"}
            </Button>
          )}
        </div>

        {error ? (
          <ErrorBox
            message={error instanceof Error ? error.message : "Revisá tu conexión."}
            onRetry={() => mutate()}
          />
        ) : !data ? (
          <div className="card p-4" aria-label="Cargando alertas">
            <div className="skeleton h-20" />
            <div className="skeleton mt-2 h-20" />
          </div>
        ) : items.length === 0 ? (
          <EmptyBox
            message={
              filter === "descartado"
                ? "No hay alertas descartadas."
                : filter === "disponible"
                  ? "No hay alertas nuevas. Cuando entre al stock un ítem pedido, aparece acá."
                  : filter === "pendiente"
                    ? "No hay pedidos esperando stock."
                    : "No hay alertas abiertas. El bot va a registrar los próximos pedidos sin stock."
            }
          />
        ) : (
          <ul className="grid gap-2.5 md:grid-cols-2">
            {items.map((item) => (
              <AlertCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onDismiss={(id) => void update({ action: "dismiss", id }, id)}
                onRestore={(id) => void update({ action: "restore", id }, id)}
              />
            ))}
          </ul>
        )}
      </main>

      {toast && (
        <div
          className="fixed bottom-20 left-1/2 z-50 w-full max-w-md -translate-x-1/2 px-4 lg:bottom-4"
          aria-live="polite"
        >
          <div className="toast" role="status">
            <span className="flex-1">{toast}</span>
          </div>
        </div>
      )}
    </Shell>
  );
}
