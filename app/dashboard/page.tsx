"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Flame,
  Gauge,
  LayoutGrid,
  MessageCircle,
  MessageSquareText,
  MoonStar,
  PhoneForwarded,
  Sparkles,
  Table2,
  Timer,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { Shell, type Period } from "@/components/dashboard/Header";
import { AttendButton } from "@/components/dashboard/AttendButton";
import { SelfSend } from "@/components/dashboard/SelfSend";
import { ErrorBox, MetricSkeleton } from "@/components/dashboard/ui";
import { Funnel, Heatmap, Insights, ModelsVsStock } from "@/components/dashboard/panels";
import { ActivityFeed, KpiCard, SectionHead } from "@/components/dashboard/motion";
import { LeadsTable, type LeadFilters } from "@/components/dashboard/LeadsTable";
import { formatDurationShort } from "@/lib/metrics";
import type { ActivityItem } from "@/lib/activity";
import { formatPhone, timeAgo } from "@/lib/format";
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

type PanelTab = "resumen" | "embudo" | "leads";

const TABS: Array<{ key: PanelTab; label: string; icon: typeof LayoutGrid }> = [
  { key: "resumen", label: "Resumen", icon: LayoutGrid },
  { key: "embudo", label: "Resumen de consultas", icon: BarChart3 },
  { key: "leads", label: "Leads", icon: Users },
];

export default function DashboardPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>("7d");
  const [tab, setTab] = useState<PanelTab>("resumen");
  const [filters, setFilters] = useState<LeadFilters>({ temperatura: "all", estado: "all", q: "", page: 1 });
  const [openLeadId, setOpenLeadId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const visible = useVisible();
  const knownIds = useRef<Set<string> | null>(null);
  const prevChange = useRef<string | null>(null);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, leadId?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg, leadId }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

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

  const { data: activity, mutate: mutateActivity } = useSWR<{ items: ActivityItem[] }>(
    "/api/dashboard/activity",
    json,
    { revalidateOnFocus: false },
  );

  const refreshAll = useCallback(() => {
    mutateSummary();
    mutateLeads();
    mutateQueue();
    mutateActivity();
  }, [mutateSummary, mutateLeads, mutateQueue, mutateActivity]);

  useEffect(() => {
    if (!status) return;
    if (prevChange.current !== null && status.lastChange !== prevChange.current) {
      refreshAll();
    }
    prevChange.current = status.lastChange;
  }, [status, refreshAll]);

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

  async function resetPanel(): Promise<void> {
    const res = await fetch("/api/dashboard/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    if (!res.ok) {
      pushToast("No se pudo vaciar");
      return;
    }
    knownIds.current = new Set();
    setNewIds(new Set());
    pushToast("Panel vaciado. Escribí al bot para verlo llenarse en vivo.");
    refreshAll();
  }

  const queueItems = useMemo(() => queue?.items ?? [], [queue]);
  const m = summary?.metrics;

  return (
    <Shell
      siteName={summary?.site.name ?? "Panel"}
      hasDemoData={summary?.hasDemoData ?? false}
      period={period}
      onPeriod={setPeriod}
      demoMode={summary?.demoMode ?? false}
      resetCount={status?.leadsTotal ?? 0}
      onReset={resetPanel}
      extraActions={summary?.demoMode ? <SelfSend onToast={pushToast} /> : undefined}
    >
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-5">
        {/* Pestañas del panel */}
        <div role="tablist" aria-label="Secciones del panel" className="no-scrollbar -mb-2 flex gap-1 overflow-x-auto border-b border-(--line)">
          {TABS.map((t) => {
            const active = tab === t.key;
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                title={t.key === "resumen" ? "Métricas, cola de atención e insights" : t.key === "embudo" ? "Embudo, horarios y demanda vs stock" : "Tabla completa con filtros y búsqueda"}
                onClick={() => setTab(t.key)}
                className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-t-xl px-3 text-sm font-bold transition-colors hover:bg-(--surface-3) ${
                  active ? "bg-(--surface-2) text-(--ink) shadow-[inset_0_0_0_1px_var(--line)]" : "text-(--ink-3)"
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                {t.label}
                {active && (
                  <motion.span
                    layoutId="panel-tab-underline"
                    className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-full bg-(--accent)"
                    transition={{ duration: 0.2 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {summary?.stock.isStale && (
          <motion.div
            role="alert"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="card flex flex-col gap-2.5 border-(--warm) p-3.5"
          >
            <p className="flex items-center gap-2 text-sm font-semibold text-(--warm)">
              <AlertTriangle size={16} aria-hidden="true" />
              El stock lleva {Math.floor(summary.stock.daysSinceUpdate ?? 0)} días sin actualizarse.
              El bot ya avisa a los clientes que la disponibilidad puede haber cambiado.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <form
                className="flex items-center gap-1.5"
                title="Cambiar a los cuántos días se muestra esta alerta"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.currentTarget.elements.namedItem("days") as HTMLInputElement | null);
                  const days = Number(input?.value);
                  if (!Number.isInteger(days) || days < 1 || days > 30) {
                    pushToast("Umbral inválido (1 a 30 días)");
                    return;
                  }
                  fetch("/api/dashboard/stock/meta", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ stale_days: days }),
                  }).then((r) => {
                    if (!r.ok) throw new Error();
                    pushToast("Umbral actualizado");
                    mutateSummary();
                  }).catch(() => pushToast("No se pudo guardar"));
                }}
              >
                <label htmlFor="stale-days-main" className="whitespace-nowrap text-xs text-(--ink-2)">
                  Avisar a los
                </label>
                <input
                  id="stale-days-main"
                  name="days"
                  type="number"
                  min={1}
                  max={30}
                  defaultValue={summary.stock.staleDays}
                  className="input tnum w-20"
                  style={{ minHeight: 36 }}
                  aria-label="Días sin actualizar para alertar"
                />
                <span className="text-xs text-(--ink-2)">días</span>
                <button type="submit" className="btn btn-ghost btn-sm" title="Guardar a los cuántos días aparece esta alerta">
                  Guardar umbral
                </button>
              </form>
            </div>
            <div>
              <a href="/dashboard/stock" className="btn btn-ghost btn-sm">
                Actualizar stock
              </a>
            </div>
          </motion.div>
        )}

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18 }}
          className="flex flex-col gap-6"
        >
      {tab === "resumen" && (
        <>
          {/* KPIS */}
          <section aria-label="Métricas principales">
          {summaryError ? (
            <ErrorBox message="Revisá tu conexión." onRetry={() => mutateSummary()} />
          ) : !summary || !m ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Cargando métricas">
              {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <MetricSkeleton key={i} />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                icon={<Zap size={16} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                label="Hoy" value={m.hoy.value} format={(n) => String(Math.round(n))}
                sub="consultas" delay={0}
              />
              <KpiCard
                icon={<MessageSquareText size={16} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                label="Atendidas" value={m.atendidas.value} format={(n) => String(Math.round(n))}
                spark={summary.daily} delay={0.03}
              />
              <KpiCard
                icon={<UserCheck size={16} className="text-(--hot)" />} tint="var(--hot-soft)"
                label="En espera" value={summary.actionCount} format={(n) => String(Math.round(n))}
                sub="esperan asesor" delay={0.06}
              />
              <KpiCard
                icon={<Flame size={16} className="text-(--hot)" />} tint="var(--hot-soft)"
                label="Calientes" value={m.calientes.value} format={(n) => String(Math.round(n))}
                delay={0.09}
              />
              <KpiCard
                icon={<PhoneForwarded size={16} className="text-(--hot)" />} tint="var(--hot-soft)"
                label="Derivados" value={m.derivados.value} format={(n) => String(Math.round(n))}
                sub="al asesor" delay={0.12}
              />
              <KpiCard
                icon={<MoonStar size={16} className="text-indigo-700 dark:text-indigo-300" />} tint="var(--cold-soft)"
                label="Fuera de hora" value={m.fueraHorario.value} format={(n) => String(Math.round(n))}
                tone="green" delay={0.15}
              />
              <KpiCard
                icon={<Timer size={16} className="text-sky-700 dark:text-sky-300" />} tint="var(--cold-soft)"
                label="1ra respuesta" value={m.primeraRespuestaSeg.value ?? 0}
                format={(n) => (m.primeraRespuestaSeg.value === null ? "—" : formatDurationShort(n))}
                sub={summary.site.humanReplyReference} delay={0.18}
              />
              <KpiCard
                icon={<Gauge size={16} className="text-(--warm)" />} tint="var(--warm-soft)"
                label="Tasa derivación"
                value={m.atendidas.value > 0 ? (m.derivados.value / m.atendidas.value) * 100 : 0}
                format={(n) => `${Math.round(n)}%`}
                delay={0.21}
              />
            </div>
          )}
        </section>

        {/* COLA */}
        <section aria-label="Para atender ahora">
          <SectionHead
            icon={<Flame size={17} className="text-(--hot)" />} tint="var(--hot-soft)"
            title="Para atender ahora" hint="Pidieron un asesor o están calientes. Los que más esperan, primero."
          />
          {!queue ? (
            <div className="card p-4" aria-hidden="true"><div className="skeleton h-12" /></div>
          ) : queueItems.length === 0 ? (
            <div className="card p-6 text-center">
              <p className="font-semibold">No hay nadie esperando</p>
              <p className="mt-1 text-sm text-(--ink-2)">Cuando un lead pida un asesor, aparece acá.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {queueItems.map((l: LeadRow) => (
                  <motion.li
                    key={l.id}
                    layout
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2 }}
                    className={`card flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center ${newIds.has(l.id) ? "row-new" : ""}`}
                  >
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
                    <div className="flex flex-wrap gap-2">
                      <button className="btn btn-primary btn-sm flex-1 sm:flex-none" onClick={() => setOpenLeadId(l.id)} title="Abrir la conversación completa">
                        Abrir
                      </button>
                      <a
                        className="btn btn-ghost btn-sm flex-1 sm:flex-none"
                        href={`https://wa.me/${l.telefono.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Continuar vos la charla desde tu WhatsApp"
                        aria-label={`Abrir WhatsApp de ${l.nombre ?? l.telefono}`}
                      >
                        <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                      </a>
                      <AttendButton
                        leadId={l.id}
                        onDone={() => {
                          pushToast("Marcado como atendido");
                          refreshAll();
                        }}
                        onError={() => pushToast("No se pudo marcar. Probá de nuevo.")}
                      />
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>

        {/* INSIGHTS */}
        {summary && summary.insights.length > 0 && <Insights items={summary.insights} />}

        {/* ACTIVIDAD (compacta, vive en Resumen) */}
        <section aria-label="Actividad reciente">
          <SectionHead
            icon={<Sparkles size={17} className="text-(--warm)" />} tint="var(--warm-soft)"
            title="Actividad reciente" hint="Lo último que pasó."
          />
          <ActivityFeed items={(activity?.items ?? []).slice(0, 6)} onOpen={setOpenLeadId} />
        </section>
        </>
      )}

      {tab === "embudo" && (
        <>
          {/* EMBUDO */}
          {summary && (
            <section aria-label="Embudo de ventas">
              <SectionHead
                icon={<BarChart3 size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                title="Embudo de ventas" hint="De la consulta a la derivación."
                action={<a href="/dashboard/embudo" className="btn btn-ghost btn-sm">Ver tablero</a>}
              />
              <Funnel steps={summary.funnel} />
            </section>
          )}
        {/* ANÁLISIS */}
        <section aria-label="Análisis" className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionHead
              icon={<CalendarClock size={17} className="text-sky-700 dark:text-sky-300" />} tint="var(--cold-soft)"
              title="Cuándo escriben" hint="Estos horarios hoy nadie atiende."
            />
            {summary ? <Heatmap cells={summary.heatmap} /> : <div className="card p-4"><div className="skeleton h-40" /></div>}
          </div>
          <div>
            <SectionHead
              icon={<Table2 size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
              title="Demanda vs stock" hint="Qué piden contra lo que hay para entregar."
            />
            {summary ? <ModelsVsStock rows={summary.modelsVsStock} /> : <div className="card p-4"><div className="skeleton h-40" /></div>}
          </div>
        </section>
        </>
      )}

      {tab === "leads" && (
        <>
          {/* TABLA */}
          <section aria-label="Leads">
          <SectionHead
            icon={<Table2 size={17} className="text-(--ink-2)" />} tint="var(--surface-3)"
            title="Leads" hint="Clic en un lead para ver la conversación."
          />
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
            />
          )}
          </section>
        </>
      )}

        </motion.div>
      </AnimatePresence>
      </main>

      <LeadDrawer
        leadId={openLeadId}
        onClose={() => setOpenLeadId(null)}
        onAttended={refreshAll}
        onToast={pushToast}
      />

      <div className="fixed bottom-20 left-1/2 z-50 flex w-full max-w-md -translate-x-1/2 flex-col gap-2 px-4 lg:bottom-4" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.18 }}
              className="toast"
              role="status"
            >
              <span className="flex-1">{t.msg}</span>
              {t.leadId && (
                <button
                  className="shrink-0 font-bold underline underline-offset-2"
                  onClick={() => { setOpenLeadId(t.leadId!); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
                >
                  Ver conversación
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-8 text-xs text-(--ink-3)">
        Teléfonos: {formatPhone("5493515550101")} como ejemplo ·
        Zona horaria America/Argentina/Cordoba
      </footer>
    </Shell>
  );
}
