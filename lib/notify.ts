"use client";

/**
 * Avisos de "chat nuevo" del lado del cliente (sin service worker ni terceros):
 * A) aviso en pantalla (sonido + título parpadeando con badge (1), (2) como WhatsApp Web)
 * B) notificación del navegador y escritorio de Windows (Notification API).
 */

export type NotifPermission = "unsupported" | "default" | "granted" | "denied";

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
}

/** Crea/resume el contexto de audio dentro de un gesto del usuario (iOS lo exige). */
export function unlockAudio(): void {
  const ctx = getAudioCtx();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

/** Aviso sonoro corto, sin archivos de audio (Web Audio API). */
export function playPing(): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(880, t0);
  osc.frequency.setValueAtTime(1318.5, t0 + 0.13);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + 0.42);
}

let baseTitle: string | null = null;

function getCleanBaseTitle(): string {
  if (typeof document === "undefined") return "";
  if (!baseTitle) {
    baseTitle = document.title.replace(/^\(\d+\)\s*/, "").replace(/^🔔\s*/, "") || "Panel · ChatBotDemo";
  }
  return baseTitle;
}

let titleFlash: { timer: number; original: string; stop: () => void } | null = null;

/** Detiene el parpadeo del título y restaura el original. */
export function stopTitleFlash(): void {
  if (!titleFlash) return;
  window.clearInterval(titleFlash.timer);
  document.title = titleFlash.original;
  titleFlash.stop();
  titleFlash = null;
}

/** Actualiza el título con el badge de mensajes no leídos: ej. "(2) Panel · ChatBotDemo" */
export function setUnreadBadge(count: number): void {
  if (typeof document === "undefined") return;
  const base = getCleanBaseTitle();
  if (count > 0) {
    document.title = `(${count}) ${base}`;
  } else {
    document.title = base;
  }
}

/** Limpia el badge del título de la pestaña. */
export function clearUnreadBadge(): void {
  setUnreadBadge(0);
}

/**
 * Hace parpadear el título de la pestaña con aviso y contador estilo WhatsApp Web:
 * Alterna entre "🔔 (1) Nuevo lead" y "(1) Astra Automotores" hasta que el usuario regresa a la pestaña.
 */
export function flashTitle(message: string, count: number = 1): void {
  if (typeof document === "undefined") return;
  stopTitleFlash();
  const original = getCleanBaseTitle();
  const prefix = count > 0 ? `(${count}) ` : "";
  const alt = `🔔 ${prefix}${message}`;
  const regular = `${prefix}${original}`;
  let on = false;

  const timer = window.setInterval(() => {
    document.title = on ? regular : alt;
    on = !on;
  }, 1200);

  const onFocus = (): void => {
    stopTitleFlash();
    clearUnreadBadge();
  };
  const onVisible = (): void => {
    if (!document.hidden) {
      stopTitleFlash();
      clearUnreadBadge();
    }
  };
  const stop = (): void => {
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisible);
  };

  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisible);
  titleFlash = { timer, original, stop };
  document.title = alt;
}

export function notificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotifPermission {
  if (!notificationSupported()) return "unsupported";
  return Notification.permission as NotifPermission;
}

const permListeners = new Set<() => void>();

/** Store para useSyncExternalStore: el permiso cambia tras pedirlo. */
export function subscribeNotifPermission(cb: () => void): () => void {
  permListeners.add(cb);
  return () => {
    permListeners.delete(cb);
  };
}

export function getNotifPermissionSnapshot(): NotifPermission {
  return getNotificationPermission();
}

export function getNotifPermissionServerSnapshot(): NotifPermission {
  return "unsupported";
}

function emitNotifPermission(): void {
  for (const cb of permListeners) cb();
}

/** Pide permiso de notificaciones. Debe llamarse dentro de un gesto del usuario. */
export async function requestNotifyPermission(): Promise<NotifPermission> {
  if (!notificationSupported()) return "unsupported";
  let result: NotifPermission;
  try {
    result = (await Notification.requestPermission()) as NotifPermission;
  } catch {
    result = getNotificationPermission();
  }
  emitNotifPermission();
  return result;
}

/**
 * Muestra una notificación en el escritorio (Windows / Mac / navegador).
 * Utiliza el icono oficial de la app y renotify para asegurar que Windows
 * muestre el banner emergente en la esquina de la pantalla.
 */
export function showBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
): boolean {
  if (!notificationSupported() || Notification.permission !== "granted") return false;
  try {
    const options: NotificationOptions = {
      body,
      tag: "nuevo-lead",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      renotify: true,
    };
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      n.close();
      onClick?.();
    };
    return true;
  } catch {
    return false;
  }
}
