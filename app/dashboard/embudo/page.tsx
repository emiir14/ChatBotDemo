"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useMemo, useState, type JSX } from "react";
import useSWR from "swr";
import { Bot, Flame, Inbox, MessagesSquare, MoveHorizontal, PhoneForwarded, Trash2, UserCheck } from "lucide-react";
import { Shell } from "@/components/dashboard/Header";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, ErrorBox, TempBadge } from "@/components/dashboard/ui";
import { Segmented } from "@/components/ui/Segmented";
import { timeAgo } from "@/lib/format";
import type { LeadRow, LeadsResponse } from "@/components/dashboard/types";

const LeadDrawer = dynamic(
  () => import("@/components/dashboard/LeadDrawer").then((m) => m.LeadDrawer),
  { ssr: false },
);

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?next=/dashboard/embudo";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}

const COLUMNS = [
  { key: "nuevo", label: "Nuevos", icon: Inbox },
  { key: "en_conversacion", label: "En conversación", icon: MessagesSquare },
  { key: "derivado", label: "Derivados", icon: PhoneForwarded },
  { key: "recontactado", label: "Recontactados", icon: UserCheck },
] as const;

/** Tablero kanban del embudo: cada columna es una etapa, cada tarjeta un lead. */
export default function EmbudoPage(): JSX.Element {
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<LeadRow | null>(null);
  const [temp, setTemp] = useState<"all" | "caliente" | "tibio" | "frio">("all");
  const { data, error, mutate } = useSWR<LeadsResponse>("/api/dashboard/leads?limit=100", json);

  const grouped = useMemo(() => {
    const map: Record<string, LeadRow[]> = { nuevo: [], en_conversacion: [], derivado: [], recontactado: [] };
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    for (const l of data?.items ?? []) {
      if (temp !== "all" && l.temperatura !== temp) continue;
      if (needle) {
        const texto = [l.nombre ?? "", l.auto_interes ?? "", l.atendido_por ?? "", l.temperatura]
          .join(" ")
          .toLowerCase();
        const telDigits = l.telefono.replace(/\D/g, "");
        const match = texto.includes(needle) || (digits.length > 0 && telDigits.includes(digits));
        if (!match) continue;
      }
      (map[l.estado] ?? map.nuevo).push(l);
    }
    return map;
  }, [data, q, temp]);

  async function deleteLead(id: string): Promise<void> {
    const res = await fetch(`/api/dashboard/lead/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    if (openLeadId === id) setOpenLeadId(null);
    await mutate();
  }

  return (
    <Shell siteName="Embudo">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 pt-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Embudo de ventas</h1>
          <p className="text-sm text-(--ink-2)">Deslizá de lado entre etapas. Clic para abrir la conversación.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            className="input sm:max-w-xs"
            placeholder="Buscar en el embudo…"
            title="Buscar por nombre o teléfono en todas las etapas"
            aria-label="Buscar en el embudo"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Segmented
            ariaLabel="Filtrar por temperatura"
            variant="pills"
            value={temp}
            onChange={(t) => setTemp(t)}
            options={[
              { value: "all", label: "Todas", title: "Ver todas las temperaturas" },
              { value: "caliente", label: "Caliente", title: "Ver solo caliente" },
              { value: "tibio", label: "Tibio", title: "Ver solo tibio" },
              { value: "frio", label: "Frío", title: "Ver solo frío" },
            ]}
          />
        </div>
        {error ? (
          <ErrorBox message="Revisá tu conexión." onRetry={() => mutate()} />
        ) : !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando embudo">
            {[0, 1, 2, 3].map((i) => <div key={i} className="card p-3"><div className="skeleton h-24" /></div>)}
          </div>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-xs font-semibold text-(--ink-2) lg:hidden">
              <MoveHorizontal size={14} aria-hidden="true" />
              Deslizá para ver las otras etapas
            </p>
            <div className="relative">
              <div
                className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-(--surface) to-transparent lg:hidden"
                aria-hidden="true"
              />
              <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-4 lg:overflow-visible lg:px-0">
                {COLUMNS.map((c, ci) => (
              <section key={c.key} aria-label={c.label} className="w-[80vw] max-w-[300px] shrink-0 snap-start rounded-2xl bg-(--surface-3)/70 p-2.5 lg:w-auto lg:max-w-none">
                <header className="sticky top-0 flex items-center gap-2 bg-(--surface-3)/70 px-1.5 pb-2 backdrop-blur">
                  <c.icon size={15} className="text-(--ink-2)" aria-hidden="true" />
                  <h2 className="text-sm font-bold">{c.label}</h2>
                  <span className="tnum ml-auto rounded-full bg-(--surface-2) px-2 py-0.5 text-xs font-bold text-(--ink-2)">
                    {grouped[c.key].length}
                  </span>
                </header>
                <ul className="flex max-h-[52vh] flex-col gap-1.5 overflow-y-auto pr-1 lg:max-h-[62vh]">
                  {grouped[c.key].map((l, i) => (
                    <motion.li
                      key={l.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(ci * 0.05 + i * 0.02, 0.4) }}
                    >
                      <div className="card lift relative w-full">
                        <button
                          onClick={() => setOpenLeadId(l.id)}
                          title={`Abrir conversación de ${l.nombre ?? "este lead"}`}
                          className="block w-full p-2.5 text-left"
                        >
                          <span className="flex items-center justify-between gap-1.5 pr-10">
                            <span className="truncate text-[0.85rem] font-bold">{l.nombre ?? "Sin nombre"}</span>
                            <TempBadge value={l.temperatura} />
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-(--ink-2)">
                            {l.auto_interes ?? "Sin interés"} · <span className="tnum">{timeAgo(l.last_customer_message_at ?? l.created_at)}</span>
                          </span>
                          {l.requiere_humano && (
                            <span className="badge badge-hot mt-1">
                              <Flame size={11} aria-hidden="true" /> Asesor
                            </span>
                          )}
                          {l.estado === "recontactado" && (
                            <span className="badge badge-neutral mt-1" title={l.recontactado_agente_at ? "Recontactado por un agente (WhatsApp)" : "Recontactado por el bot"}>
                              {l.recontactado_agente_at ? <UserCheck size={11} aria-hidden="true" /> : <Bot size={11} aria-hidden="true" />}
                              {l.recontactado_agente_at ? "Recontacto agente" : "Recontacto bot"}
                            </span>
                          )}
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="absolute right-1.5 top-1.5"
                          onClick={() => setConfirm(l)}
                          aria-label={`Eliminar lead ${l.nombre ?? l.telefono}`}
                          tooltip="Eliminar lead (borra la conversación)"
                        >
                          <Trash2 size={13} aria-hidden="true" />
                        </Button>
                      </div>
                    </motion.li>
                  ))}
                  {grouped[c.key].length === 0 && (
                    <li className="px-2 py-4 text-center text-xs text-(--ink-3)">Vacío</li>
                  )}
                  {grouped[c.key].length > 4 && (
                    <li aria-hidden="true" className="sticky bottom-0 -mb-1 h-5 bg-gradient-to-b from-transparent to-[var(--surface-3)]" />
                  )}
                </ul>
              </section>
                ))}
              </div>
            </div>
          </>
        )}
      </main>
      {confirm && (
        <ConfirmDialog
          title="Eliminar lead"
          danger
          confirmLabel="Eliminar"
          message={
            <>
              ¿Eliminar a <strong>{confirm.nombre ?? confirm.telefono}</strong> y toda su conversación?
              Es permanente. Si vuelve a escribir, el bot lo trata como primer contacto.
            </>
          }
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            void deleteLead(id);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
      <LeadDrawer
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        onAttended={() => mutate()}
        onToast={() => undefined}
      />
    </Shell>
  );
}
