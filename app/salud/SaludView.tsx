"use client";

import { useEffect, useState, type JSX, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Database,
  KeyRound,
  Loader2,
  MinusCircle,
  RefreshCw,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { BotRun, HealthReport, ModelPing } from "@/lib/health";
import { runHealth } from "./actions";

const MODEL_LABELS: Record<string, string> = {
  "gemini-3.1-flash-lite": "Gemini 3.1 Flash-Lite",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
};

const STATUS_LABELS: Record<string, string> = {
  DEADLINE_EXCEEDED: "Tiempo agotado",
  UNAVAILABLE: "Saturado / no disponible",
  RESOURCE_EXHAUSTED: "Sin cuota disponible",
  NOT_FOUND: "Modelo no encontrado",
  NO_API_KEY: "Falta la API key",
  INTERNAL: "Error interno de Google",
};

function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model;
}

function statusText(ping: ModelPing): string {
  if (ping.ok) return "Responde bien";
  if (ping.status && STATUS_LABELS[ping.status]) return STATUS_LABELS[ping.status];
  if (ping.status) return ping.status;
  if (ping.code) return `Error ${ping.code}`;
  return "Sin respuesta";
}

function fmtMs(ms: number): string {
  if (!ms) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toLocaleString("es-AR", { maximumFractionDigits: 1 })} s`;
}

const OK_STYLE = {
  background: "color-mix(in srgb, var(--ok) 15%, transparent)",
  color: "var(--ok)",
};
const FAIL_STYLE = {
  background: "color-mix(in srgb, var(--danger) 15%, transparent)",
  color: "var(--danger)",
};
const IDLE_STYLE = {
  background: "var(--surface-3)",
  color: "var(--ink-3)",
};

function styleFor(state: boolean | null) {
  return state === null ? IDLE_STYLE : state ? OK_STYLE : FAIL_STYLE;
}

function StatusIcon({
  state,
  size = 18,
}: {
  state: boolean | null;
  size?: number;
}): JSX.Element {
  if (state === null) return <MinusCircle size={size} aria-hidden="true" />;
  return state ? (
    <CheckCircle2 size={size} aria-hidden="true" />
  ) : (
    <XCircle size={size} aria-hidden="true" />
  );
}

function Card({
  icon,
  title,
  ok,
  subtitle,
  children,
}: {
  icon: ReactNode;
  title: string;
  ok: boolean | null;
  subtitle?: string;
  children?: ReactNode;
}): JSX.Element {
  return (
    <section className="card p-4 sm:p-5">
      <header className="flex items-start gap-3">
        <span
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full"
          style={styleFor(ok)}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[0.95rem] font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[0.82rem] text-(--ink-2)">{subtitle}</p>}
        </div>
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full"
          style={styleFor(ok)}
          title={ok === null ? "Sin probar" : ok ? "Funciona" : "Falla"}
        >
          <StatusIcon state={ok} size={18} />
        </span>
      </header>
      {children && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function SaludView(): JSX.Element {
  const [data, setData] = useState<HealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  async function check(withBot: boolean): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      setData(await runHealth(withBot));
      setCheckedAt(new Date());
    } catch {
      setError("No se pudo conectar con el chequeo. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const report = await runHealth(false);
        if (!cancelled) {
          setData(report);
          setCheckedAt(new Date());
        }
      } catch {
        if (!cancelled) setError("No se pudo conectar con el chequeo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const models = data?.models ?? [];
  const botRun: BotRun | null = data?.botRun ?? null;
  const overall = data?.ok ?? false;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Salud del bot</h1>
          <p className="mt-1 text-sm text-(--ink-2)">
            Chequeo en vivo de la demo.{" "}
            {checkedAt && (
              <span>
                Última prueba:{" "}
                {checkedAt.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
                .
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void check(false)}
            disabled={loading}
            tooltip="Volver a chequear todo menos el bot"
          >
            <RefreshCw size={16} aria-hidden="true" />
            Actualizar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void check(true)}
            disabled={loading}
            tooltip="Hace una respuesta real de prueba (gasta 1 llamada a la IA)"
          >
            <Bot size={16} aria-hidden="true" />
            Probar bot ahora
          </Button>
        </div>
      </header>

      <div
        className="mt-5 flex items-center gap-3 rounded-xl bg-(--surface-3) px-4 py-3"
        style={data ? styleFor(overall) : undefined}
        role="status"
      >
        {loading && !data ? (
          <Loader2 size={20} className="animate-spin" aria-hidden="true" />
        ) : (
          <StatusIcon state={data ? overall : null} size={20} />
        )}
        <div>
          <p className="text-sm font-semibold">
            {!data ? "Chequeando…" : overall ? "Todo funcionando" : "Hay algo fallando"}
          </p>
          <p className="text-[0.8rem] opacity-80">
            {!data
              ? "Esperá un segundo."
              : overall
                ? "La demo está lista para la reunión."
                : "Mirá el detalle de cada tarjeta."}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-lg px-3 py-2 text-sm" style={FAIL_STYLE}>
          {error}
        </p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Card
          icon={<KeyRound size={18} aria-hidden="true" />}
          title="Variables de entorno"
          ok={data?.checks.env?.ok ?? false}
          subtitle={data?.checks.env?.detail ?? "Sin datos"}
        />

        <Card
          icon={<Database size={18} aria-hidden="true" />}
          title="Base de datos (Supabase)"
          ok={data?.checks.supabase?.ok ?? false}
          subtitle={data?.checks.supabase?.detail ?? "Sin datos"}
        />
      </div>

      <div className="mt-3">
        <Card
          icon={<Stethoscope size={18} aria-hidden="true" />}
          title="Modelos de IA"
          ok={data?.checks.gemini?.ok ?? false}
          subtitle="El bot usa el primero que responda (cascada)."
        >
          <ul className="flex flex-col gap-2">
            {models.length === 0 && (
              <li className="text-sm text-(--ink-2)">Sin modelos configurados.</li>
            )}
            {models.map((m) => (
              <li
                key={m.model}
                className="flex items-center gap-3 rounded-lg border border-(--line) px-3 py-2"
              >
                <span
                  className="flex size-7 shrink-0 items-center justify-center rounded-full"
                  style={styleFor(m.ok)}
                >
                  <StatusIcon state={m.ok} size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{modelLabel(m.model)}</p>
                  <p className="text-[0.78rem] text-(--ink-2)">{statusText(m)}</p>
                </div>
                <span className="shrink-0 text-[0.78rem] font-medium tabular-nums text-(--ink-2)">
                  {fmtMs(m.ms)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-3">
        <Card
          icon={<Bot size={18} aria-hidden="true" />}
          title="Prueba del bot (respuesta real)"
          ok={botRun ? botRun.ok : null}
          subtitle={
            botRun
              ? botRun.ok
                ? "Respondió con el stock real."
                : "No pudo responder."
              : "Todavía no se probó."
          }
        >
          {!botRun ? (
            <p className="text-sm text-(--ink-2)">
              Tocá <strong>«Probar bot ahora»</strong> para que el bot genere una
              respuesta de verdad.
            </p>
          ) : botRun.ok ? (
            <div>
              <div className="flex flex-wrap items-center gap-2 text-[0.8rem] text-(--ink-2)">
                <span className="badge badge-accent">{modelLabel(botRun.model ?? "")}</span>
                <span>Tardó {fmtMs(botRun.ms)}</span>
              </div>
              {botRun.reply && (
                <blockquote className="mt-2 rounded-lg border border-(--line) bg-(--surface) px-3 py-2 text-sm leading-relaxed">
                  “{botRun.reply}”
                </blockquote>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              {botRun.error ?? "El bot no devolvió respuesta."}
            </p>
          )}
        </Card>
      </div>
    </main>
  );
}
