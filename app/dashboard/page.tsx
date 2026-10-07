"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import useSWR from "swr";
import { Flame, MessageCircle, UserCheck } from "lucide-react";
import { Header, type Period } from "@/components/dashboard/Header";
import { ErrorBox, MetricSkeleton, SectionTitle } from "@/components/dashboard/ui";
import { Funnel, Heatmap, Insights, MetricCard, ModelsVsStock } from "@/components/dashboard/panels";
import { LeadsTable, type LeadFilters } from "@/components/dashboard/LeadsTable";
import { formatDurationShort } from "@/lib/metrics";
import { formatPhone, maskPhoneFull, timeAgo } from "@/lib/format";
import type { LeadRow, LeadsResponse, StatusResponse, SummaryResponse } from "@/components/dashboard/types";

const LeadDrawer = dynamic(
  () => import("@/components/dashboard/LeadDrawer").then((m) => m.LeadDrawer),
  { ssr: false },
);

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = "/login?next=/dashboard";
    throw new Error("Sesión vencida");
  }
  if (!res.ok) throw new Error(`Error ${res.status}`);
  return res.json() as Promise<T>;
}

interface Toast {
  id: number;
  msg: string;
  leadId?: string;
}

function useVisible(): boolean {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const onChange = (): void => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return visible;
}

export default function DashboardPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>("7d");
  const [filters, setFilters] = useState<LeadFilters>({ temperatura: "all", estado: "all", q: "", page: 1 });
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [noMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const visible = useVisible();
  const knownIds = useRef<Set<string> | null>(null);
  const prevChange = useRef<string | null>(null);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, leadId?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg, leadId }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  // 1. Polling liviano cada 4 s (pausado si la pestaña no está visible).
  const { data: status } = useSWR<StatusResponse>("/api/dashboard/status", json, {
    refreshInterval: visible ? 4000 : 0,
    revalidateOnFocus: false,
  });

  const summaryKey = `/api/dashboard/summary?period=${period}`;
  const { data: summary, error: summaryError, mutate: mutateSummary } =
    useSWR<SummaryResponse>(summaryKey, json, { revalidateOnFocus: false });

  const leadsParams = new URLSearchParams({
    temperatura: filters.temperatura,
    estado: filters.estado,
    q: filters.q,
    page: String(filters.page),
  });
  const { data: leads, error: leadsError, mutate: mutateLeads } =
    useSWR<LeadsResponse>(`/api/dashboard/leads?${leadsParams}`, json, { revalidateOnFocus: false });

  const { data: queue, mutate: mutateQueue } = useSWR<LeadsResponse>(
    "/api/dashboard/leads?onlyAction=true&page=1",
    json,
    { revalidateOnFocus: false },
  );

  const refreshAll = useCallback(() => {
    mutateSummary();
    mutateLeads();
    mutateQueue();
  }, [mutateSummary, mutateLeads, mutateQueue]);

  // 2. Si el status cambió, refrescar datos completos.
  useEffect(() => {
    if (!status) return;
    if (prevChange.current !== null && status.lastChange !== prevChange.current) {
      refreshAll();
    }
    prevChange.current = status.lastChange;
  }, [status, refreshAll]);

  // 3. Detectar leads nuevos → toast + resaltado temporal.
  useEffect(() => {
    if (!leads) return;
    const ids = new Set(leads.items.map((l) => l.id));
    if (knownIds.current === null) {
      knownIds.current = ids;
      return;
    }
    const fresh = leads.items.filter((l) => !knownIds.current!.has(l.id));
    knownIds.current = ids;
    if (fresh.length > 0) {
      const first = fresh[0];
      pushToast(`Nuevo lead: ${first.nombre ?? "sin nombre"}`, first.id);
      setNewIds(new Set(fresh.map((l) => l.id)));
      window.setTimeout(() => setNewIds(new Set()), 6000);
    }
  }, [leads, pushToast]);

  async function markAttended(id: string): Promise<void> {
    await fetch("/api/dashboard/attend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id }),
    });
    pushToast("Marcado como atendido");
    refreshAll();
  }

  const queueItems = useMemo(() => (queue?.items ?? []).slice(0, 5), [queue]);

  return (
    <div className={noMotion ? "no-motion" : ""}>
      <Header
        siteName={summary?.site.name ?? "Panel"}
        period={period}
        onPeriod={(p) => { setPeriod(p); }}
        presentation={presentation}
        onPresentation={setPresentation}
        hasDemoData={summary?.hasDemoData ?? false}
      />

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-5">
        {/* FRANJA DE VALOR */}
        <section aria-label="Métricas principales">
          {summaryError ? (
            <ErrorBox message="Revisá tu conexión." onRetry={() => mutateSummary()} />
          ) : !summary ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Cargando métricas">
              {[0, 1, 2, 3, 4].map((i) => <MetricSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <MetricCard
                label="Consultas atendidas"
                value={String(summary.metrics.atendidas.value)}
                variation={summary.metrics.atendidas.variation}
                how="Leads con al menos una respuesta del bot en el período."
                spark={summary.daily}
                big={presentation}
              />
              <MetricCard
                label="Primera respuesta"
                value={formatDurationShort(summary.metrics.primeraRespuestaSeg.value)}
                sub={summary.site.humanReplyReference}
                how="Mediana entre el primer mensaje del cliente y la primera respuesta del bot, por lead."
                big={presentation}
              />
              <MetricCard
                label="Fuera de horario"
                value={String(summary.metrics.fueraHorario.value)}
                sub="Antes se perdían o esperaban a la mañana"
                variation={summary.metrics.fueraHorario.variation}
                how="Atendidas que llegaron fuera del horario comercial (lun-vie 9-18, sáb 9-13)."
                big={presentation}
              />
              <MetricCard
                label="Leads calientes"
                value={String(summary.metrics.calientes.value)}
                variation={summary.metrics.calientes.variation}
                how="Modelo concreto + presupuesto o pago definido + compra en menos de 30 días, o pidió visita, prueba o reserva."
                big={presentation}
              />
              <MetricCard
                label="Tasa de calificación"
                value={`${Math.round(summary.metrics.tasaCalificacion.value)}%`}
                how="% de leads del período con nombre, modelo y presupuesto cargados."
                big={presentation}
              />
            </div>
          )}
        </section>

        {/* COLA DE ACCIÓN */}
        <section aria-label="Para atender ahora">
          <SectionTitle title="Para atender ahora" hint="Pidieron un asesor o están calientes. Los que más esperan, primero." />
          {!queue ? (
            <div className="card p-4" aria-hidden="true"><div className="skeleton h-12" /></div>
          ) : queueItems.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="font-semibold">No hay nadie esperando 🎉</p>
              <p className="mt-1 text-sm text-(--ink-2)">Cuando un lead pida un asesor, aparece acá.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {queueItems.map((l: LeadRow) => (
                <li key={l.id} className={`card flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center ${newIds.has(l.id) ? "row-new" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-bold">
                      {l.nombre ?? "Sin nombre"}
                      {l.requiere_humano && (
                        <span className="badge badge-hot"><Flame size={12} aria-hidden="true" /> Asesor</span>
                      )}
                    </p>
                    <p className="truncate text-sm text-(--ink-2)">
                      {[l.auto_interes, l.presupuesto].filter(Boolean).join(" · ") || "Sin datos todavía"}
                    </p>
                    <p className="tnum text-xs text-(--ink-3)">
                      esperando {timeAgo(l.last_customer_message_at ?? l.created_at)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm flex-1 sm:flex-none" onClick={() => setOpenLeadId(l.id)}>
                      Abrir
                    </button>
                    <a
                      className="btn btn-ghost btn-sm flex-1 sm:flex-none"
                      href={`https://wa.me/${l.telefono.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir WhatsApp de ${l.nombre ?? l.telefono}`}
                    >
                      <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                    </a>
                    <button className="btn btn-ghost btn-sm flex-1 sm:flex-none" onClick={() => markAttended(l.id)}>
                      <UserCheck size={14} aria-hidden="true" /> Atendido
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* EMBUDO */}
        {summary && (
          <section aria-label="Embudo">
            <SectionTitle title="Embudo" hint="De la consulta a la derivación." />
            <Funnel steps={summary.funnel} />
          </section>
        )}

        {/* ANÁLISIS */}
        <section aria-label="Análisis" className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionTitle title="Cuándo escriben" hint="Estos horarios hoy nadie atiende." />
            {summary ? <Heatmap cells={summary.heatmap} /> : <div className="card p-4"><div className="skeleton h-40" /></div>}
          </div>
          <div>
            <SectionTitle title="Demanda vs stock" hint="Qué piden contra lo que hay para entregar." />
            {summary ? <ModelsVsStock rows={summary.modelsVsStock} /> : <div className="card p-4"><div className="skeleton h-40" /></div>}
          </div>
        </section>

        {/* INSIGHTS */}
        {!presentation && summary && summary.insights.length > 0 && <Insights items={summary.insights} />}

        {/* TABLA */}
        <section aria-label="Leads">
          <SectionTitle title="Leads" hint="Clic en un lead para ver la conversación." />
          {leadsError ? (
            <ErrorBox message="Revisá tu conexión." onRetry={() => mutateLeads()} />
          ) : !leads ? (
            <div className="card p-4" aria-label="Cargando leads">
              <div className="skeleton h-10" />
              <div className="skeleton mt-2 h-10" />
              <div className="skeleton mt-2 h-10" />
            </div>
          ) : (
            <LeadsTable
              items={leads.items}
              total={leads.total}
              page={leads.page}
              pageSize={leads.pageSize}
              filters={filters}
              onFilters={setFilters}
              onOpen={setOpenLeadId}
              newIds={newIds}
              presentation={presentation}
            />
          )}
        </section>
      </main>

      <LeadDrawer
        leadId={openLeadId}
        presentation={presentation}
        onClose={() => setOpenLeadId(null)}
        onAttended={refreshAll}
        onToast={pushToast}
      />

      {/* Toasts */}
      <div className="fixed bottom-4 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast" role="status">
            <span className="flex-1">{t.msg}</span>
            {t.leadId && (
              <button
                className="shrink-0 font-bold underline underline-offset-2"
                onClick={() => { setOpenLeadId(t.leadId!); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
              >
                Ver conversación
              </button>
            )}
          </div>
        ))}
      </div>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-(--ink-3)">
        Teléfonos: {presentation ? maskPhoneFull("5493515550101") : formatPhone("5493515550101")} como ejemplo ·
        Zona horaria America/Argentina/Cordoba
      </footer>
    </div>
  );
}
