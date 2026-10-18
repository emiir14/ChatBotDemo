"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPushState, enablePush, disablePush, type PushState } from "@/lib/push";
import { unlockAudio } from "@/lib/notify";

/**
 * Control de notificaciones del dispositivo. El permiso del navegador se pide
 * SOLO cuando se toca "Activar" (nunca al cargar).
 */
export function NotificationSettings({
  onToast,
}: {
  onToast: (msg: string) => void;
}): JSX.Element {
  const [state, setState] = useState<PushState | "checking">("checking");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    void getPushState().then((s) => {
      if (alive) setState(s);
    });
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => {
      alive = false;
      document.removeEventListener("mousedown", onClick);
    };
  }, []);

  async function turnOn(): Promise<void> {
    unlockAudio();
    setBusy(true);
    const result = await enablePush();
    setState(result.state);
    setBusy(false);
    if (result.ok) {
      onToast("Notificaciones activadas en este dispositivo");
      setOpen(false);
    } else if (result.state === "blocked") {
      onToast("El navegador bloqueó las notificaciones. Habilitalas desde el candado de la barra.");
    } else if (result.state === "ios-install") {
      onToast("En iPhone: agregá el sitio a la pantalla de inicio y abrí la app desde ahí.");
    } else if (result.state === "unsupported") {
      onToast("Este navegador no soporta notificaciones del sistema.");
    } else {
      onToast("No se pudieron activar las notificaciones. Probá de nuevo.");
    }
  }

  async function turnOff(): Promise<void> {
    setBusy(true);
    await disablePush();
    const next = await getPushState();
    setState(next);
    setBusy(false);
    onToast("Notificaciones desactivadas en este dispositivo");
    setOpen(false);
  }

  const on = state === "on";

  return (
    <span className="relative" ref={ref}>
      <Button
        variant="solid"
        size="sm"
        className="px-2.5 sm:px-3"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Notificaciones de nuevos chats"
        tooltip="Notificaciones de nuevos chats"
        tooltipSide="bottom"
      >
        {state === "checking" ? (
          <Loader2 size={15} className="animate-spin" aria-hidden="true" />
        ) : on ? (
          <BellRing size={15} aria-hidden="true" className="text-(--accent-strong)" />
        ) : state === "unsupported" || state === "blocked" ? (
          <BellOff size={15} aria-hidden="true" />
        ) : (
          <Bell size={15} aria-hidden="true" />
        )}
        <span className="hidden md:inline">{on ? "Notificaciones" : "Activar"}</span>
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Notificaciones"
          className="absolute right-0 top-10 z-50 flex w-72 flex-col gap-3 rounded-xl border border-(--line) bg-(--surface-2) p-3.5 text-sm shadow-xl"
        >
          <p className="font-bold">Notificaciones de nuevos chats</p>

          {state === "checking" && (
            <p className="text-(--ink-2)">Verificando el estado…</p>
          )}

          {on && (
            <>
              <p className="text-(--ink-2)">
                Activadas en <strong>este dispositivo</strong>. Te avisamos cuando un chat necesite un
                vendedor o sea un lead caliente.
              </p>
              <Button variant="ghost" size="sm" disabled={busy} onClick={turnOff} tooltip="Dejar de recibir avisos en este dispositivo">
                {busy ? "Desactivando…" : "Desactivar en este dispositivo"}
              </Button>
            </>
          )}

          {state === "off" && (
            <>
              <p className="text-(--ink-2)">
                Recibí un aviso cuando un chat pida un vendedor o sea un lead caliente.
              </p>
              <Button variant="primary" size="sm" disabled={busy} onClick={turnOn} tooltip="Pedir permiso y activar los avisos en este dispositivo">
                {busy ? "Activando…" : "Activar notificaciones"}
              </Button>
            </>
          )}

          {state === "blocked" && (
            <p className="text-(--ink-2)">
              El navegador bloqueó las notificaciones. Habilitalas desde el <strong>candado</strong> de la
              barra de direcciones y volvé a intentar.
            </p>
          )}

          {state === "ios-install" && (
            <p className="text-(--ink-2)">
              En <strong>iPhone</strong> hay que instalar la app primero: tocá <strong>Compartir</strong> →
              <strong> Agregar a pantalla de inicio</strong>, abrí el sitio desde ese ícono y después tocá
              Activar.
            </p>
          )}

          {state === "unsupported" && (
            <p className="text-(--ink-2)">
              Este navegador no soporta notificaciones del sistema. Igual vas a ver los avisos dentro del
              panel cuando esté abierto.
            </p>
          )}

          <p className="border-t border-(--line) pt-2 text-xs text-(--ink-3)">
            Cada celular o PC se activa por separado.
          </p>
        </div>
      )}
    </span>
  );
}
