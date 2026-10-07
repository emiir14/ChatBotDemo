"use client";

import { BarChart3, Boxes, LayoutDashboard, LogOut, Moon, Play, Pause, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type JSX, type ReactNode } from "react";
import type { PeriodKey } from "@/lib/metrics";

export type Period = PeriodKey;

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
];

const NAV = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/dashboard/embudo", label: "Embudo", icon: BarChart3 },
  { href: "/dashboard/stock", label: "Stock", icon: Boxes },
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
 * Shell del panel estilo CRM (Kommo/Interakt): sidebar oscuro en escritorio,
 * barra superior compacta + tabs inferiores en móvil.
 */
export function Shell({
  siteName,
  hasDemoData,
  period,
  onPeriod,
  presentation,
  onPresentation,
  children,
}: {
  siteName: string;
  hasDemoData: boolean;
  period?: Period;
  onPeriod?: (p: Period) => void;
  presentation?: boolean;
  onPresentation?: (v: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
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
            className="flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-semibold text-white/65 hover:bg-white/6 hover:text-white"
          >
            {dark ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
            {dark ? "Modo claro" : "Modo oscuro"}
          </button>
          <button
            onClick={logout}
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
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-2.5">
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
              <div role="group" aria-label="Período" className="flex overflow-hidden rounded-lg border border-(--line)">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => onPeriod(p.key)}
                    aria-pressed={period === p.key}
                    className={`min-h-[36px] px-2.5 text-[0.83rem] font-semibold transition-colors sm:px-3 sm:text-sm ${
                      period === p.key ? "bg-(--accent) text-(--accent-ink)" : "text-(--ink-2)"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            {onPresentation && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => onPresentation(!presentation)}
                aria-pressed={!!presentation}
                title="Agranda métricas, oculta teléfonos y quita secundarios"
              >
                {presentation ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                <span className="hidden sm:inline">Presentación</span>
              </button>
            )}
            <button className="btn btn-ghost btn-sm lg:hidden" onClick={logout} aria-label="Cerrar sesión">
              <LogOut size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        {children}
      </div>

      {/* Tabs inferiores en móvil */}
      <nav
        aria-label="Secciones"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-(--line) bg-(--surface-2)/98 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <div className="grid grid-cols-3">
          {NAV.map((n) => {
            const active = pathname === n.href;
            const Icon = n.icon;
            return (
              <a
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
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
