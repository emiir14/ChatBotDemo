"use client";

import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from "react";
import useSWR from "swr";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Clock,
  Flame,
  Layers,
  LayoutGrid,
  LineChart,
  MessageCircle,
  MessageSquareText,
  MoonStar,
  PhoneForwarded,
  Repeat,
  Sparkles,
  Table2,
  Thermometer,
  Timer,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  Wallet,
  Zap,
} from "lucide-react";
import { Shell, type CustomRange, type Period } from "@/components/dashboard/Header";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AttendButton } from "@/components/dashboard/AttendButton";
import { SelfSend } from "@/components/dashboard/SelfSend";
import { NotificationSettings } from "@/components/dashboard/NotificationSettings";
import { StaleThresholdForm } from "@/components/dashboard/StaleThresholdForm";
import { ErrorBox, MetricSkeleton, ConfirmDialog } from "@/components/dashboard/ui";
import { Funnel, Heatmap, Insights, ModelsVsStock } from "@/components/dashboard/panels";
import {
  BusinessHours,
  DailyTrend,
  EstadoDist,
  ExportCsvButton,
  FirstResponse,
  ModelStages,
  PriceDemand,
  Recontact,
  TempDist,
} from "@/components/dashboard/charts";
import { ActivityFeed, KpiCard, SectionHead } from "@/components/dashboard/motion";
import { LeadsTable, type LeadFilters } from "@/components/dashboard/LeadsTable";
import { customDayBounds, formatDurationShort } from "@/lib/metrics";
import type { ActivityItem } from "@/lib/activity";
import { formatPhone, timeAgo } from "@/lib/format";
import { flashTitle, playPing, showBrowserNotification } from "@/lib/notify";
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
  { key: "resumen", label: "General", icon: LayoutGrid },
  { key: "leads", label: "Leads", icon: Users },
  { key: "embudo", label: "Resumen de consultas", icon: BarChart3 },
];

export default function DashboardPage(): JSX.Element {
  const [period, setPeriod] = useState<Period>("today");
  const [custom, setCustom] = useState<CustomRange | null>(null);
  const [tab, setTab] = useState<PanelTab>("resumen");
  const [filters, setFilters] = useState<LeadFilters>({ temperatura: "all", estado: "all", atendido: "all", recontacto: "all", q: "", sort: "actividad", dir: "desc", page: 1 });
  const [openLeadId, setOpenLeadId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("lead");
  });
  const [confirmDelete, setConfirmDelete] = useState<LeadRow | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const visible = useVisible();
  const knownIds = useRef<Set<string> | null>(null);
  const knownTotal = useRef<number | null>(null);
  const prevChange = useRef<string | null>(null);
  const toastId = useRef(0);

  const pushToast = useCallback((msg: string, leadId?: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-2), { id, msg, leadId }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 8000);
  }, []);

  const { data: status } = useSWR<StatusResponse>("/api/dashboard/status", json, {
    // En primer plano cada 4s; en segundo plano más lento, para poder avisar
    // de un chat nuevo aunque la pestaña no esté visible.
    refreshInterval: visible ? 4000 : 15000,
    revalidateOnFocus: false,
  });

  const summaryParams = new URLSearchParams({ period });
  if (period === "custom" && custom) {
    const bounds = customDayBounds(custom.from, custom.to);
    summaryParams.set("from", bounds.from.toISOString());
    summaryParams.set("to", bounds.to.toISOString());
  }
  const summaryKey = `/api/dashboard/summary?${summaryParams}`;
  const { data: summary, error: summaryError, mutate: mutateSummary } =
    useSWR<SummaryResponse>(period === "custom" && !custom ? null : summaryKey, json, {
      revalidateOnFocus: false,
      // Mantiene los datos del período anterior mientras carga el nuevo:
      // así el encabezado y el nombre del negocio no parpadean al cambiar de rango.
      keepPreviousData: true,
    });

  const leadsParams = new URLSearchParams({
    temperatura: filters.temperatura,
    estado: filters.estado,
    atendido: filters.atendido,
    recontacto: filters.recontacto,
    sort: filters.sort,
    dir: filters.dir,
    q: filters.q,
    page: String(filters.page),
  });
  const { data: leads, error: leadsError, mutate: mutateLeads } =
    useSWR<LeadsResponse>(`/api/dashboard/leads?${leadsParams}`, json, {
      revalidateOnFocus: false,
      keepPreviousData: true,
    });

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

  const markAgentRecontact = useCallback(
    (id: string) => {
      void fetch("/api/dashboard/recontact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: id, step: "agente" }),
      })
        .then(() => refreshAll())
        .catch(() => undefined);
    },
    [refreshAll],
  );

  const deleteLead = useCallback(
    (id: string) => {
      void fetch(`/api/dashboard/lead/${id}`, { method: "DELETE" })
        .then((res) => {
          if (!res.ok) throw new Error();
          pushToast("Lead eliminado");
          setOpenLeadId((cur) => (cur === id ? null : cur));
          refreshAll();
        })
        .catch(() => pushToast("No se pudo eliminar el lead"));
    },
    [pushToast, refreshAll],
  );

  useEffect(() => {
    if (!status) return;
    if (prevChange.current !== null && status.lastChange !== prevChange.current) {
      refreshAll();
    }
    prevChange.current = status.lastChange;
  }, [status, refreshAll]);

  // Solo detectamos "lead nuevo" en la vista sin filtros: al buscar o filtrar,
  // entran y salen leads del resultado y no son nuevos de verdad.
  const leadsDefaultView =
    filters.q === "" &&
    filters.temperatura === "all" &&
    filters.estado === "all" &&
    filters.atendido === "all" &&
    filters.recontacto === "all" &&
    filters.page === 1;

  useEffect(() => {
    if (!leads || !leadsDefaultView) return;
    const ids = new Set(leads.items.map((l) => l.id));
    if (knownIds.current === null || knownTotal.current === null) {
      knownIds.current = ids;
      knownTotal.current = leads.total;
      return;
    }
    // Un lead nuevo hace crecer el total. Al eliminar uno el total baja y el
    // listado se recompone (entra uno de la página siguiente): eso NO es un
    // lead nuevo, por eso solo detectamos cuando el total creció.
    const fresh = leads.total > knownTotal.current
      ? leads.items.filter((l) => !knownIds.current!.has(l.id))
      : [];
    knownIds.current = ids;
    knownTotal.current = leads.total;
    if (fresh.length > 0) {
      const first = fresh[0];
      const label = first.nombre ?? "Sin nombre";
      pushToast(`Nuevo lead: ${first.nombre ?? "sin nombre"}`, first.id);
      setNewIds(new Set(fresh.map((l) => l.id)));
      window.setTimeout(() => setNewIds(new Set()), 6000);
      playPing();
      flashTitle(`Nuevo lead: ${label}`);
      showBrowserNotification(
        "Nuevo chat en el bot",
        `${label}${first.auto_interes ? ` · ${first.auto_interes}` : ""}`,
        () => setOpenLeadId(first.id),
      );
    }
  }, [leads, leadsDefaultView, pushToast]);

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
    knownIds.current = null;
    knownTotal.current = null;
    setNewIds(new Set());
    pushToast("Panel vaciado. Escribí al bot para verlo llenarse en vivo.");
    refreshAll();
  }

  const queueItems = useMemo(() => (queue?.items ?? []).slice(0, 5), [queue]);
  const queueTotal = queue?.total ?? 0;
  const m = summary?.metrics;

  return (
    <Shell
      siteName={summary?.site.name ?? "Panel"}
      period={period}
      onPeriod={(p) => {
        setPeriod(p);
        if (p !== "custom") setCustom(null);
      }}
      custom={period === "custom" ? custom : null}
      onCustom={(from, to) => {
        setCustom({ from, to });
        setPeriod("custom");
      }}
      onClearCustom={() => {
        setCustom(null);
        setPeriod("7d");
      }}
      demoMode={summary?.demoMode ?? false}
      resetCount={status?.leadsTotal ?? 0}
      onReset={resetPanel}
      extraActions={
        <>
          {summary?.demoMode && <SelfSend onToast={pushToast} />}
          <NotificationSettings onToast={pushToast} />
        </>
      }
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
            <StaleThresholdForm
              idPrefix="stale-days-main"
              initialDays={summary.stock.staleDays}
              onError={pushToast}
              onSave={async (days) => {
                const r = await fetch("/api/dashboard/stock/meta", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ stale_days: days }),
                });
                if (!r.ok) {
                  pushToast("No se pudo guardar");
                  return;
                }
                pushToast("Umbral actualizado");
                mutateSummary();
              }}
            />
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
                label="Consultas" value={m.consultas.value} format={(n) => String(Math.round(n))}
                sub={summary.periodLabel} delay={0}
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
                icon={<Trophy size={16} className="text-(--warm)" />} tint="var(--warm-soft)"
                label="Top modelo"
                value={summary.modelsVsStock[0]?.consultas ?? 0}
                format={(n) => String(Math.round(n))}
                text={summary.modelsVsStock[0]?.modelo}
                sub={summary.modelsVsStock[0] ? `${summary.modelsVsStock[0].consultas} consultas` : "sin datos"}
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
                      <Button variant="primary" size="sm" className="flex-1 sm:flex-none" onClick={() => setOpenLeadId(l.id)} tooltip="Abrir la conversación completa">
                        Abrir
                      </Button>
                      <ButtonLink
                        variant="ghost"
                        size="sm"
                        className="flex-1 sm:flex-none"
                        href={`https://wa.me/${l.telefono.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => markAgentRecontact(l.id)}
                        tooltip="Continuar vos la charla desde tu WhatsApp"
                        aria-label={`Abrir WhatsApp de ${l.nombre ?? l.telefono}`}
                      >
                        <MessageCircle size={14} aria-hidden="true" /> WhatsApp
                      </ButtonLink>
                      <AttendButton
                        leadId={l.id}
                        onDone={() => {
                          pushToast("Guardado");
                          refreshAll();
                        }}
                        onError={() => pushToast("No se pudo marcar. Probá de nuevo.")}
                      />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setConfirmDelete(l)}
                        aria-label={`Eliminar ${l.nombre ?? l.telefono}`}
                        tooltip="Eliminar lead (borra la conversación)"
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </Button>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
          {queueTotal > queueItems.length && queueItems.length > 0 && (
            <p className="tnum mt-2 text-xs text-(--ink-2)">
              Mostrando los 5 más recientes · {queueTotal} en espera
            </p>
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
          {/* Barra de la pestaña: siempre visible, para que la acción no se pierda */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">Resumen de consultas</h1>
              <p className="text-sm text-(--ink-2)">
                Período: <strong>{summary?.periodLabel ?? "cargando…"}</strong> · analítica de la conversación.
              </p>
            </div>
            <ExportCsvButton summary={summary} />
          </div>

          {/* EMBUDO */}
          {summary && (
            <section aria-label="Embudo de ventas">
              <SectionHead
                icon={<BarChart3 size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                title="Embudo de ventas" hint="De la consulta a la derivación."
                action={<ButtonLink href="/dashboard/embudo" variant="ghost" size="sm" tooltip="Abrir el tablero kanban por etapa">Ver tablero</ButtonLink>}
              />
              <Funnel steps={summary.funnel} />
            </section>
          )}
        {/* ANÁLISIS */}
        {!summary ? (
          <div className="grid gap-6 lg:grid-cols-2">
            {[0, 1, 2, 3].map((i) => <div key={i} className="card p-4"><div className="skeleton h-40" /></div>)}
          </div>
        ) : (
          <>
            <section aria-label="Tendencia diaria">
              <SectionHead
                icon={<LineChart size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                title="Tendencia diaria" hint="Cuántas consultas entraron cada día."
              />
              <DailyTrend data={summary.daily} />
            </section>

            <section aria-label="Perfil de los leads" className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionHead
                  icon={<Thermometer size={17} className="text-(--hot)" />} tint="var(--hot-soft)"
                  title="Por temperatura" hint="Calientes, tibios y fríos."
                />
                <TempDist data={summary.tempDist} />
              </div>
              <div>
                <SectionHead
                  icon={<Layers size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                  title="Por etapa" hint="En qué punto está cada lead."
                />
                <EstadoDist data={summary.estadoDist} />
              </div>
            </section>

            <section aria-label="Velocidad y horarios" className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionHead
                  icon={<Timer size={17} className="text-sky-700 dark:text-sky-300" />} tint="var(--cold-soft)"
                  title="Tiempo de primera respuesta" hint="Qué tan rápido contesta el bot."
                />
                <FirstResponse data={summary.firstResponse} />
              </div>
              <div>
                <SectionHead
                  icon={<Clock size={17} className="text-indigo-700 dark:text-indigo-300" />} tint="var(--cold-soft)"
                  title="Horario comercial" hint="Dentro vs fuera de horario."
                />
                <BusinessHours data={summary.businessHours} />
              </div>
            </section>

            <section aria-label="Recontacto y horarios pico" className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionHead
                  icon={<Repeat size={17} className="text-(--warm)" />} tint="var(--warm-soft)"
                  title="Recontacto" hint="¿Los revive el bot o un asesor?"
                />
                <Recontact data={summary.recontact} />
              </div>
              <div>
                <SectionHead
                  icon={<CalendarClock size={17} className="text-sky-700 dark:text-sky-300" />} tint="var(--cold-soft)"
                  title="Cuándo escriben" hint="Cuándo se concentran las consultas."
                />
                <Heatmap cells={summary.heatmap} />
              </div>
            </section>

            <section aria-label="Embudo y precios" className="grid gap-6 lg:grid-cols-2">
              <div>
                <SectionHead
                  icon={<BarChart3 size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                  title="Embudo por modelo" hint="Cómo avanza cada modelo."
                />
                <ModelStages data={summary.modelsStages} />
              </div>
              <div>
                <SectionHead
                  icon={<Wallet size={17} className="text-(--warm)" />} tint="var(--warm-soft)"
                  title="Demanda vs stock por precio" hint="Qué buscan contra lo que hay."
                />
                <PriceDemand data={summary.priceDemand} />
              </div>
            </section>

            <section aria-label="Demanda por modelo">
              <SectionHead
                icon={<Table2 size={17} className="text-(--accent-strong) dark:text-(--accent)" />} tint="var(--accent-soft)"
                title="Modelos más pedidos vs stock" hint="Qué piden contra lo que hay para entregar."
              />
              <ModelsVsStock rows={summary.modelsVsStock} />
            </section>
          </>
        )}
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
              onDelete={deleteLead}
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

      {confirmDelete && (
        <ConfirmDialog
          title="Eliminar lead"
          danger
          confirmLabel="Eliminar"
          message={
            <>
              ¿Eliminar a <strong>{confirmDelete.nombre ?? formatPhone(confirmDelete.telefono)}</strong> y toda su
              conversación? Es permanente. Si vuelve a escribir, el bot lo trata como primer contacto.
            </>
          }
          onConfirm={() => {
            const id = confirmDelete.id;
            setConfirmDelete(null);
            deleteLead(id);
          }}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

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
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  tooltip="Abrir la conversación de ese lead"
                  onClick={() => { setOpenLeadId(t.leadId!); setToasts((x) => x.filter((y) => y.id !== t.id)); }}
                >
                  Ver conversación
                </Button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Shell>
  );
}
