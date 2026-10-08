"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { useMemo, useState, type JSX } from "react";
import useSWR from "swr";
import { Flame, Inbox, MessagesSquare, PhoneForwarded, UserCheck } from "lucide-react";
import { Shell } from "@/components/dashboard/Header";
import { ErrorBox, TempBadge } from "@/components/dashboard/ui";
import { maskPhoneFull, timeAgo } from "@/lib/format";
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
  const { data, error, mutate } = useSWR<LeadsResponse>("/api/dashboard/leads?limit=100", json);

  const grouped = useMemo(() => {
    const map: Record<string, LeadRow[]> = { nuevo: [], en_conversacion: [], derivado: [], recontactado: [] };
    for (const l of data?.items ?? []) {
      (map[l.estado] ?? map.nuevo).push(l);
    }
    return map;
  }, [data]);

  return (
    <Shell siteName="Embudo" hasDemoData={false}>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 pt-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Embudo de ventas</h1>
          <p className="text-sm text-(--ink-2)">Dónde está cada lead. Clic para abrir la conversación.</p>
        </div>
        {error ? (
          <ErrorBox message="Revisá tu conexión." onRetry={() => mutate()} />
        ) : !data ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Cargando embudo">
            {[0, 1, 2, 3].map((i) => <div key={i} className="card p-3"><div className="skeleton h-24" /></div>)}
          </div>
        ) : (
          <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COLUMNS.map((c, ci) => (
              <section key={c.key} aria-label={c.label} className="rounded-2xl bg-(--surface-3)/70 p-2.5">
                <header className="flex items-center gap-2 px-1.5 pb-2">
                  <c.icon size={15} className="text-(--ink-2)" aria-hidden="true" />
                  <h2 className="text-sm font-bold">{c.label}</h2>
                  <span className="tnum ml-auto rounded-full bg-(--surface-2) px-2 py-0.5 text-xs font-bold text-(--ink-2)">
                    {grouped[c.key].length}
                  </span>
                </header>
                <ul className="flex flex-col gap-2">
                  {grouped[c.key].map((l, i) => (
                    <motion.li
                      key={l.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: Math.min(ci * 0.05 + i * 0.02, 0.4) }}
                    >
                      <button
                        onClick={() => setOpenLeadId(l.id)}
                        className="card lift w-full p-3 text-left"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-bold text-[0.9rem]">{l.nombre ?? "Sin nombre"}</span>
                          <TempBadge value={l.temperatura} />
                        </span>
                        <span className="tnum mt-0.5 block truncate text-xs text-(--ink-2)">
                          {maskPhoneFull(l.telefono)} · {l.auto_interes ?? "Sin interés"}
                        </span>
                        <span className="tnum mt-1 block text-[0.72rem] text-(--ink-3)">
                          {timeAgo(l.last_customer_message_at ?? l.created_at)}
                        </span>
                        {l.requiere_humano && (
                          <span className="badge badge-hot mt-1.5">
                            <Flame size={11} aria-hidden="true" /> Asesor
                          </span>
                        )}
                      </button>
                    </motion.li>
                  ))}
                  {grouped[c.key].length === 0 && (
                    <li className="px-2 py-4 text-center text-xs text-(--ink-3)">Vacío</li>
                  )}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
      <LeadDrawer
        leadId={openLeadId}
        presentation={false}
        onClose={() => setOpenLeadId(null)}
        onAttended={() => mutate()}
        onToast={() => undefined}
      />
    </Shell>
  );
}
