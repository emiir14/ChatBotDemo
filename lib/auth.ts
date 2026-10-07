/**
 * Sesión del panel: cookie firmada con HMAC-SHA256 (WebCrypto, funciona en
 * Edge middleware y en Node). Sin JWT ni dependencias.
 */

const COOKIE_NAME = "chatbotdemo_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 días (dueño, demo)

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("Falta SESSION_SECRET.");
  return secret;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  return Buffer.from(sig).toString("hex");
}

function slowEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Crea el valor de la cookie para una sesión nueva. */
export async function createSessionToken(nowSec?: number): Promise<string> {
  const exp = (nowSec ?? Math.floor(Date.now() / 1000)) + SESSION_TTL_SECONDS;
  const sig = await hmac(`dashboard:${exp}`);
  return `${exp}.${sig}`;
}

/** Valida el valor de la cookie. */
export async function verifySessionToken(
  token: string | undefined | null,
  nowSec?: number,
): Promise<boolean> {
  if (!token) return false;
  const [expStr, sig] = token.split(".");
  const exp = Number(expStr);
  if (!expStr || !sig || !Number.isFinite(exp)) return false;
  if (exp <= (nowSec ?? Math.floor(Date.now() / 1000))) return false;
  const expected = await hmac(`dashboard:${exp}`);
  return slowEqual(sig, expected);
}

export function getCookieName(): string {
  return COOKIE_NAME;
}

// ---------------------------------------------------------------------------
// Límite de intentos de login fallidos (en memoria, por IP)
// ---------------------------------------------------------------------------

const MAX_FAILS = 10;
const WINDOW_MS = 10 * 60 * 1000;
const fails = new Map<string, { count: number; resetAt: number }>();

export function registerFailedLogin(ip: string, now: number = Date.now()): boolean {
  const entry = fails.get(ip);
  if (!entry || now > entry.resetAt) {
    fails.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_FAILS;
}

export function clearFailedLogins(ip: string): void {
  fails.delete(ip);
}

/** Solo para tests. */
export function __clearLoginFails(): void {
  fails.clear();
}
