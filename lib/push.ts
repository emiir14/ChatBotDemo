"use client";

/**
 * Web Push del lado del cliente: registra el service worker, pide permiso
 * (solo dentro de un gesto del usuario) y suscribe/desuscribe el dispositivo.
 * El permiso NUNCA se pide automáticamente: lo dispara un botón del panel.
 */

export type PushState = "unsupported" | "ios-install" | "blocked" | "off" | "on";

type PushCapability =
  | { supported: true; standalone: boolean }
  | {
      supported: false;
      reason: "insecure" | "no-sw" | "no-push" | "ios-needs-install" | "no-key";
    };

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function looksLikeIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function getPushCapability(): PushCapability {
  if (typeof window === "undefined") return { supported: false, reason: "no-sw" };
  if (!window.isSecureContext) return { supported: false, reason: "insecure" };
  if (!("serviceWorker" in navigator)) return { supported: false, reason: "no-sw" };
  if (!("PushManager" in window) || !("Notification" in window)) {
    return looksLikeIOS() && !isStandalone()
      ? { supported: false, reason: "ios-needs-install" }
      : { supported: false, reason: "no-push" };
  }
  if (!PUBLIC_KEY) return { supported: false, reason: "no-key" };
  return { supported: true, standalone: isStandalone() };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function getRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

/** Estado actual para la UI. */
export async function getPushState(): Promise<PushState> {
  const cap = getPushCapability();
  if (!cap.supported) {
    return cap.reason === "ios-needs-install" ? "ios-install" : "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Activa las notificaciones en ESTE dispositivo. Llamar desde un gesto. */
export async function enablePush(): Promise<{ ok: boolean; state: PushState }> {
  const cap = getPushCapability();
  if (!cap.supported) {
    return { ok: false, state: cap.reason === "ios-needs-install" ? "ios-install" : "unsupported" };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, state: permission === "denied" ? "blocked" : "off" };
  }
  try {
    const reg = await getRegistration();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY as string) as BufferSource,
      });
    }
    const json = sub.toJSON();
    const res = await fetch("/api/dashboard/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: sub.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    });
    if (!res.ok) {
      await sub.unsubscribe().catch(() => undefined);
      return { ok: false, state: "off" };
    }
    return { ok: true, state: "on" };
  } catch {
    return { ok: false, state: "off" };
  }
}

/** Desactiva las notificaciones en ESTE dispositivo y borra la suscripción. */
export async function disablePush(): Promise<void> {
  const cap = getPushCapability();
  if (!cap.supported) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    const endpoint = sub.endpoint;
    await fetch("/api/dashboard/push", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe().catch(() => undefined);
  } catch {
    /* ignorar */
  }
}
