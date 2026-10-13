"use client";

import { BarChart3, Boxes, CalendarDays, LayoutDashboard, LogOut, Moon, Percent, Sun, Trash2, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import type { PeriodKey } from "@/lib/metrics";

export type Period = PeriodKey | "custom";

export interface CustomRange {
  from: string;
  to: string;
}

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
  { key: "all", label: "Todo" },
];

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/dashboard/embudo", label: "Embudo", icon: BarChart3 },
  { href: "/dashboard/stock", label: "Stock", icon: Boxes },
  { href: "/dashboard/financiacion", label: "Financiación", icon: Percent },
];

function Logo({ size = 34 }: { size?: number }): JSX.Element {
  return (
    <span
      className="flex items-center justify-center rounded-xl bg-(--accent-soft) text-(--accent-strong)"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <rect x="2" y="6" width="20" height="11" rx="2.5" fill="currentColor" opacity="0.9" />
        <circle cx="7.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="16.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 9.5 7 6.8h7.5L20 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/**
 * Botón de rango personalizado: abre un panel con desde/hasta (inputs de
 * fecha nativos, aptos para móvil) y aplica. Máximo 400 días.
 */
function CustomButton({
  active,
  onCustom,
}: {
  active: boolean;
  onCustom: (from: string, to: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(): void {
    if (!from || !to) {
      setError("Elegí desde y hasta");
      return;
    }
    if (from >= to) {
      setError("Desde debe ser anterior a hasta");
      return;
    }
    onCustom(from, to);
    setOpen(false);
    setError(null);
  }

  return (
    <span className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-pressed={active}
        aria-expanded={open}
        title="Elegir un rango de fechas"
        className={`flex min-h-[36px] items-center px-2.5 transition-colors ${
          active ? "bg-(--accent) text-(--accent-ink)" : "text-(--ink-2)"
        }`}
      >
        <CalendarDays size={15} aria-hidden="true" />
      </button>
      {open && (
        <span className="absolute right-0 top-10 z-50 flex w-56 flex-col gap-2 rounded-xl border border-(--line) bg-(--surface-2) p-3 shadow-xl">
          <label className="flex flex-col gap-1 text-xs font-bold">
            Desde
            <input type="date" className="input" style={{ minHeight: 36 }} value={from} max={to || undefined}
              onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-xs font-bold">
            Hasta
            <input type="date" className="input" style={{ minHeight: 36 }} value={to} min={from || undefined}
              onChange={(e) => setTo(e.target.value)} />
          </label>
          {error && <span role="alert" className="text-xs font-semibold text-(--danger)">{error}</span>}
          <button className="btn btn-primary btn-sm" onClick={apply}>
            Aplicar
          </button>
        </span>
      )}
    </span>
  );
}

/**
 * Shell del panel estilo CRM (Kommo/Interakt): sidebar oscuro en escritorio,
 * barra superior compacta + tabs inferiores en móvil.
 */
export function Shell({
  siteName,
  hasDemoData,
  period,
  onPeriod,
  custom,
  onCustom,
  onClearCustom,
  children,
  demoMode,
  resetCount,
  onReset,
  extraActions,
}: {
  siteName: string;
  hasDemoData: boolean;
  period?: Period;
  onPeriod?: (p: Period) => void;
  /** Rango personalizado activo (muestra chip con opción de quitar). */
  custom?: CustomRange | null;
  onCustom?: (from: string, to: string) => void;
  onClearCustom?: () => void;
  children: ReactNode;
  /** Botón "Vaciar panel" (solo demo): se muestra si viene onReset. */
  demoMode?: boolean;
  resetCount?: number;
  onReset?: () => Promise<void>;
  /** Acciones extra de la barra (solo demo). */
  extraActions?: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("theme") === "dark") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  function toggleDark(): void {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  async function logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-dvh lg:flex">
      {/* Sidebar escritorio */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-[#0d2118] p-4 text-white lg:flex dark:bg-black/60">
        <div className="flex items-center gap-2.5 px-1 pb-6 pt-1">
          <Logo />
          <div className="min-w-0">
            <p className="truncate text-[1.02rem] font-bold leading-tight tracking-tight">{siteName}</p>
            <p className="flex items-center gap-1.5 text-xs text-white/70">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Bot activo
            </p>
          </div>
        </div>
        <nav aria-label="Secciones" className="flex flex-col gap-1">
          {NAV.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
              <a
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                title={n.href === "/dashboard" ? "Panel: métricas, leads y actividad" : n.href === "/dashboard/embudo" ? "Embudo: tablero kanban por etapa" : "Stock: autos, precios e importación"}
                className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[0.95rem] font-semibold transition-all ${
                  active ? "bg-white/12 text-white shadow-inner" : "text-white/65 hover:bg-white/6 hover:text-white"
                }`}
              >
                <Icon size={18} aria-hidden="true" />
                {n.label}
              </a>
            );
          })}
        </nav>
        {hasDemoData && (
          <p className="mt-4 rounded-xl bg-white/8 px-3 py-2 text-xs text-white/75">
            Datos de demostración incluidos
          </p>
        )}
        <div className="mt-auto flex flex-col gap-1 border-t border-white/10 pt-3">
          <button
            onClick={toggleDark}
            aria-pressed={dark}
            title={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
            className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/65 hover:bg-white/6 hover:text-white"
          >
            {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            {dark ? "Modo claro" : "Modo oscuro"}
          </button>
          <button
            onClick={logout}
            title="Cerrar sesión del panel"
            className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/65 hover:bg-white/6 hover:text-white"
          >
            <LogOut size={17} aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Columna principal */}
      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        {/* Topbar */}
        <header className="sticky top-0 z-30 border-b border-(--line) bg-(--surface)/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5">
            <div className="flex items-center gap-2 lg:hidden">
              <Logo size={30} />
              <p className="max-w-[40vw] truncate text-[0.95rem] font-bold">{siteName}</p>
            </div>
            <span className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-(--ink-2) lg:ml-0">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute h-full w-full animate-ping rounded-full bg-(--ok) opacity-60" />
                <span className="h-2 w-2 rounded-full bg-(--ok)" />
              </span>
              <span className="hidden sm:inline">Bot activo</span>
            </span>
            {hasDemoData && (
              <span className="badge badge-neutral">Datos de demostración</span>
            )}
            {period && onPeriod && (
              <>
                <div role="group" aria-label="Período" className="flex overflow-hidden rounded-lg border border-(--line)">
                  {PERIODS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => onPeriod(p.key)}
                      aria-pressed={period === p.key}
                      title={p.key === "all" ? "Todo el historial" : `Ver ${p.label.toLowerCase()}`}
                      className={`min-h-[36px] px-2.5 text-[0.83rem] font-semibold transition-colors sm:px-3 sm:text-sm ${
                        period === p.key ? "bg-(--accent) text-(--accent-ink)" : "text-(--ink-2)"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  {onCustom && (
                    <CustomButton active={period === "custom"} onCustom={onCustom} />
                  )}
                </div>
                {period === "custom" && custom && (
                  <span className="badge badge-accent" title="Rango personalizado activo">
                    {custom.from} – {custom.to}
                    {onClearCustom && (
                      <button onClick={onClearCustom} aria-label="Quitar rango personalizado" className="ml-1 font-bold">
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </span>
                )}
              </>
            )}
            {demoMode && onReset && (
              confirmingReset ? (
                <span className="flex max-w-full flex-wrap items-center gap-1.5 rounded-lg border border-(--danger) px-2 py-1 text-xs font-bold">
                  ¿Vaciar {resetCount ?? ""} leads?
                  <button
                    className="min-h-[32px] rounded-md bg-(--danger) px-2.5 text-white"
                    disabled={resetting}
                    onClick={async () => {
                      setResetting(true);
                      try {
                        await onReset();
                      } finally {
                        setResetting(false);
                        setConfirmingReset(false);
                      }
                    }}
                  >
                    {resetting ? "…" : "Sí, vaciar"}
                  </button>
                  <button
                    className="min-h-[32px] px-1.5 underline"
                    onClick={() => setConfirmingReset(false)}
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setConfirmingReset(true)}
                  title="Vacía leads y mensajes (el stock queda). Para la demo en vivo."
                  aria-label="Vaciar panel"
                >
                  <Trash2 size={15} aria-hidden="true" />
                  <span className="hidden sm:inline">Vaciar</span>
                </button>
              )
            )}
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión del panel">
              <LogOut size={15} aria-hidden="true" />
            </button>
            {extraActions}
          </div>
        </header>

        {children}
      </div>

      {/* Tabs inferiores en móvil */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-(--line) bg-(--surface-2)/98 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-4">
          {NAV.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
                <a
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                title={n.href === "/dashboard" ? "Panel: métricas, leads y actividad" : n.href === "/dashboard/embudo" ? "Embudo: tablero kanban por etapa" : "Stock: autos, precios e importación"}
                className={`flex min-h-[60px] flex-col items-center justify-center gap-0.5 text-[0.7rem] font-bold transition-colors ${
                  active ? "text-(--accent)" : "text-(--ink-3)"
                }`}
              >
                <Icon size={20} aria-hidden="true" />
                {n.label}
                {active && <span className="h-1 w-8 rounded-full bg-(--accent)" aria-hidden="true" />}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
