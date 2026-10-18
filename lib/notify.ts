"use client";

/**
 * Avisos de "chat nuevo" del lado del cliente (sin service worker ni terceros):
 * A) aviso en pantalla (sonido + título parpadeando) — lo maneja la página.
 * B) notificación del navegador mientras la pestaña del panel está abierta.
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

let titleFlash: { timer: number; original: string; stop: () => void } | null = null;

/** Detiene el parpadeo del título y restaura el original. */
export function stopTitleFlash(): void {
  if (!titleFlash) return;
  window.clearInterval(titleFlash.timer);
  document.title = titleFlash.original;
  titleFlash.stop();
  titleFlash = null;
}

/** Hace parpadear el título de la pestaña hasta que el usuario vuelve a la pestaña. */
export function flashTitle(message: string): void {
  if (typeof document === "undefined") return;
  stopTitleFlash();
  const original = document.title;
  const alt = `🔔 ${message}`;
  let on = false;
  const timer = window.setInterval(() => {
    document.title = on ? original : alt;
    on = !on;
  }, 1300);
  const onFocus = (): void => stopTitleFlash();
  const onVisible = (): void => {
    if (!document.hidden) stopTitleFlash();
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
 * Muestra una notificación del navegador. Devuelve false si no se pudo
 * (permiso denegado o constructor no soportado en móviles, que requiere
 * service worker).
 */
export function showBrowserNotification(
  title: string,
  body: string,
  onClick?: () => void,
): boolean {
  if (!notificationSupported() || Notification.permission !== "granted") return false;
  try {
    const options: NotificationOptions = { body, tag: "nuevo-lead" };
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
