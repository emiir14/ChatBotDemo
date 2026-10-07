"use client";

import { LogOut, Moon, Sun, Play, Pause } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type JSX } from "react";
import type { PeriodKey } from "@/lib/metrics";

export type Period = PeriodKey;

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: "today", label: "Hoy" },
  { key: "7d", label: "7 días" },
  { key: "30d", label: "30 días" },
];

/** Encabezado: logo, período, bot activo, presentación, tema, salir. */
export function Header({
  siteName,
  period,
  onPeriod,
  presentation,
  onPresentation,
  hasDemoData,
}: {
  siteName: string;
  period: Period;
  onPeriod: (p: Period) => void;
  presentation: boolean;
  onPresentation: (v: boolean) => void;
  hasDemoData: boolean;
}): JSX.Element {
  const router = useRouter();
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") {
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
    <header className="sticky top-0 z-30 border-b border-(--line) bg-(--surface)/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5">
        <div className="mr-auto flex items-center gap-2.5">
          <span className="login-logo" aria-hidden="true" style={{ width: 34, height: 34 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <rect x="2" y="6" width="20" height="11" rx="2.5" fill="currentColor" opacity="0.9" />
              <circle cx="7.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
              <circle cx="16.5" cy="17.5" r="2" fill="var(--surface)" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 9.5 7 6.8h7.5L20 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <div>
            <p className="text-[1.05rem] font-bold leading-tight tracking-tight">{siteName}</p>
            <p className="flex items-center gap-1.5 text-xs text-(--ink-2)">
              <span className="relative flex h-2 w-2" aria-hidden="true">
                <span className="absolute h-full w-full animate-ping rounded-full bg-(--ok) opacity-60" />
                <span className="h-2 w-2 rounded-full bg-(--ok)" />
              </span>
              Bot activo
            </p>
          </div>
          {hasDemoData && (
            <span className="badge badge-neutral" title="Hay leads de demostración mezclados">
              Datos de demostración
            </span>
          )}
        </div>

        <div role="group" aria-label="Período" className="flex overflow-hidden rounded-lg border border-(--line)">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => onPeriod(p.key)}
              aria-pressed={period === p.key}
              className={`min-h-[36px] px-3 text-sm font-semibold transition-colors ${
                period === p.key ? "bg-(--accent) text-(--accent-ink)" : "text-(--ink-2)"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => onPresentation(!presentation)}
          aria-pressed={presentation}
          title="Agranda métricas, oculta teléfonos y quita secundarios"
        >
          {presentation ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
          <span className="hidden sm:inline">Modo presentación</span>
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={toggleDark}
          aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          aria-pressed={dark}
        >
          {dark ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={logout} aria-label="Cerrar sesión">
          <LogOut size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
