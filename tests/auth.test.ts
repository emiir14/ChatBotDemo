import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __clearLoginFails,
  clearFailedLogins,
  createSessionToken,
  registerFailedLogin,
  verifySessionToken,
} from "@/lib/auth";

const SECRET = "secreto-de-test-largo";

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", SECRET);
  __clearLoginFails();
});

describe("sesión firmada", () => {
  it("crea y verifica, rechaza adulterada y vencida", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await createSessionToken(now);
    expect(await verifySessionToken(token, now + 60)).toBe(true);
    // Adulterada (cambia el primer char sí o sí)
    const [exp, sig] = token.split(".");
    const flipped = (sig[0] === "0" ? "1" : "0") + sig.slice(1);
    expect(await verifySessionToken(`${exp}.${flipped}`, now + 60)).toBe(false);
    // Vencida (7 días + 1 s)
    expect(await verifySessionToken(token, now + 7 * 24 * 60 * 60 + 1)).toBe(false);
    // Malformadas
    expect(await verifySessionToken(null, now)).toBe(false);
    expect(await verifySessionToken("basura", now)).toBe(false);
  });
});

describe("throttle de login", () => {
  it("bloquea tras 10 fallos y se limpia al lograrlo", () => {
    const ip = "1.2.3.4";
    for (let i = 0; i < 10; i++) {
      expect(registerFailedLogin(ip)).toBe(false);
    }
    expect(registerFailedLogin(ip)).toBe(true);
    clearFailedLogins(ip);
    expect(registerFailedLogin(ip)).toBe(false);
  });
});
