import { describe, expect, it } from "vitest";
import {
  isOutsideBusinessHours,
  isWithin24hWindow,
  WHATSAPP_FREE_WINDOW_MS,
} from "@/lib/time";

describe("isWithin24hWindow (ventana gratuita de WhatsApp)", () => {
  const now = new Date("2026-10-05T15:00:00-03:00");

  it("devuelve true si el último mensaje fue hace 23 h", () => {
    const last = new Date(now.getTime() - 23 * 60 * 60 * 1000).toISOString();
    expect(isWithin24hWindow(last, now)).toBe(true);
  });

  it("devuelve false si pasaron más de 24 h", () => {
    const last = new Date(
      now.getTime() - (WHATSAPP_FREE_WINDOW_MS + 1000),
    ).toISOString();
    expect(isWithin24hWindow(last, now)).toBe(false);
  });

  it("devuelve false en el borde exacto de 24 h (ventana vencida)", () => {
    const last = new Date(
      now.getTime() - WHATSAPP_FREE_WINDOW_MS,
    ).toISOString();
    expect(isWithin24hWindow(last, now)).toBe(false);
  });

  it("devuelve false con null, undefined o fecha inválida", () => {
    expect(isWithin24hWindow(null, now)).toBe(false);
    expect(isWithin24hWindow(undefined, now)).toBe(false);
    expect(isWithin24hWindow("no-es-fecha", now)).toBe(false);
  });

  it("devuelve false si la fecha es futura", () => {
    const future = new Date(now.getTime() + 60_000).toISOString();
    expect(isWithin24hWindow(future, now)).toBe(false);
  });
});

describe("isOutsideBusinessHours (America/Argentina/Cordoba)", () => {
  it("lunes 10 h local = dentro de horario", () => {
    // Lunes 2026-09-28 10:00 ART
    expect(isOutsideBusinessHours("2026-09-28T10:00:00-03:00")).toBe(false);
  });

  it("lunes 20 h local = fuera de horario", () => {
    expect(isOutsideBusinessHours("2026-09-28T20:00:00-03:00")).toBe(true);
  });

  it("sábado 10 h local = dentro de horario", () => {
    // Sábado 2026-10-03 10:00 ART
    expect(isOutsideBusinessHours("2026-10-03T10:00:00-03:00")).toBe(false);
  });

  it("sábado 15 h local = fuera de horario", () => {
    expect(isOutsideBusinessHours("2026-10-03T15:00:00-03:00")).toBe(true);
  });

  it("domingo a cualquier hora = fuera de horario", () => {
    // Domingo 2026-10-04 11:00 ART
    expect(isOutsideBusinessHours("2026-10-04T11:00:00-03:00")).toBe(true);
  });
});
