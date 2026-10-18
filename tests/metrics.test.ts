import { describe, expect, it } from "vitest";
import { buildActivity } from "@/lib/activity";
import {
  buildFunnel,
  buildInsights,
  customDayBounds,
  maxCustomTo,
  median,
  periodLabel,
  periodRange,
  previousRange,
  resolveRange,
  startOfCordobaDay,
  validateCustomBounds,
  variation,
} from "@/lib/metrics";

describe("median", () => {
  it("impar, par y vacío", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20])).toBe(15);
    expect(median([])).toBeNull();
  });
});

describe("variation", () => {
  it("calcula % con signo y null sin datos previos", () => {
    expect(variation(120, 100)).toEqual({ pct: 20, up: true });
    expect(variation(80, 100)?.up).toBe(false);
    expect(variation(10, 0)).toBeNull();
    expect(variation(0, 0)).toBeNull();
  });
});

describe("startOfCordobaDay", () => {
  it("la medianoche de Córdoba es 03:00 UTC del mismo día civil", () => {
    // Miércoles 2026-10-07 01:00 UTC = martes 6, 22:00 en Córdoba.
    const start = startOfCordobaDay(new Date("2026-10-07T01:00:00Z"));
    expect(start.toISOString()).toBe("2026-10-06T03:00:00.000Z");
  });
});

describe("periodRange + previousRange", () => {
  it("7d y su anterior de igual duración, pegados", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const cur = periodRange("7d", now);
    expect(cur.ms).toBe(7 * 24 * 60 * 60 * 1000);
    const prev = previousRange(cur);
    expect(prev.to.getTime()).toBe(cur.from.getTime());
    expect(prev.ms).toBe(cur.ms);
  });
  it("today arranca a la medianoche de Córdoba", () => {
    const now = new Date("2026-10-07T15:00:00Z"); // 12:00 ART
    const cur = periodRange("today", now);
    expect(cur.from.toISOString()).toBe("2026-10-07T03:00:00.000Z");
  });
});

describe("resolveRange + periodLabel + customDayBounds", () => {
  it("custom incluye el día hasta completo en hora Córdoba", () => {
    const b = customDayBounds("2026-10-01", "2026-10-05");
    expect(b.from.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(b.to.toISOString()).toBe("2026-10-06T03:00:00.000Z");
    const r = resolveRange({ key: "custom", from: b.from, to: b.to });
    expect(r.ms).toBe(5 * 24 * 60 * 60 * 1000);
  });
  it("etiquetas por preset y personalizado", () => {
    expect(periodLabel("today")).toBe("hoy");
    expect(periodLabel("7d")).toBe("últimos 7 días");
    expect(periodLabel("30d")).toBe("últimos 30 días");
    expect(periodLabel("all")).toBe("todo el historial");
    const b = customDayBounds("2026-10-01", "2026-10-05");
    expect(periodLabel({ key: "custom", from: b.from, to: b.to })).toContain("–");
  });
  it("all arranca en 2020", () => {
    const r = resolveRange("all", new Date("2026-10-07T12:00:00Z"));
    expect(r.from.toISOString()).toBe("2020-01-01T00:00:00.000Z");
  });
});

describe("validateCustomBounds (sin fechas futuras)", () => {
  const now = new Date("2026-10-07T12:00:00Z"); // 09:00 ART del 7/10

  it("acepta un rango que termina hoy (cota exclusiva = mañana en Córdoba)", () => {
    const from = startOfCordobaDay(now);
    const to = maxCustomTo(now);
    expect(to.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    expect(validateCustomBounds(from, to, now).ok).toBe(true);
  });

  it("rechaza un rango que se extiende al futuro", () => {
    const from = startOfCordobaDay(now);
    const to = new Date("2026-10-09T03:00:00.000Z"); // dentro de 2 días
    const res = validateCustomBounds(from, to, now);
    expect(res.ok).toBe(false);
    expect(res.msg).toContain("futuras");
  });

  it("rechaza desde posterior a hasta y fechas inválidas", () => {
    const from = new Date("2026-10-07T03:00:00.000Z");
    expect(validateCustomBounds(from, from, now).ok).toBe(false);
    expect(validateCustomBounds(new Date(NaN), from, now).ok).toBe(false);
  });

  it("a la noche usa el día de Córdoba, no el UTC", () => {
    // 2026-10-08T02:30Z = 7/10 23:30 en Córdoba: "hoy" sigue siendo el 7.
    const night = new Date("2026-10-08T02:30:00Z");
    const today = maxCustomTo(night);
    expect(today.toISOString()).toBe("2026-10-08T03:00:00.000Z");
    // El 8 en Córdoba ya es futuro a esa hora.
    expect(
      validateCustomBounds(startOfCordobaDay(night), new Date("2026-10-09T03:00:00Z"), night).ok,
    ).toBe(false);
  });
});

describe("buildFunnel", () => {
  it("% de paso entre pasos consecutivos", () => {
    const f = buildFunnel([
      { key: "a", label: "A", value: 100 },
      { key: "b", label: "B", value: 40 },
      { key: "c", label: "C", value: 10 },
    ]);
    expect(f[0].conversionFromPrev).toBeNull();
    expect(f[1].conversionFromPrev).toBe(40);
    expect(f[2].conversionFromPrev).toBe(25);
  });
});

describe("buildInsights", () => {
  it("genera hasta 3 frases con números reales", () => {
    const ins = buildInsights({
      atendidas: 100,
      fueraHorario: 30,
      calientesSinAtender: 2,
      topModelo: { modelo: "S10", consultas: 12, stock: 0 },
      pico: { dia: "sábado", hora: 11, n: 9 },
    });
    expect(ins.length).toBeLessThanOrEqual(3);
    const text = ins.map((i) => i.text).join(" ");
    expect(text).toContain("30%");
    expect(text).toContain("S10");
    expect(text).toContain("sábado");
  });
  it("sin datos no inventa nada", () => {
    expect(
      buildInsights({
        atendidas: 0,
        fueraHorario: 0,
        calientesSinAtender: 0,
        topModelo: null,
        pico: null,
      }),
    ).toEqual([]);
  });
});

describe("buildActivity", () => {
  const base = {
    id: "m1",
    texto: "Hola",
    created_at: "2026-10-07T12:00:00Z",
    lead_id: "l1",
    lead_nombre: "Ana",
    lead_requiere: false,
    lead_first: "2026-10-07T12:00:00Z",
  };
  it("clasifica nuevo lead, mensaje, respuesta y derivado", () => {
    const items = buildActivity([
      { ...base, rol: "cliente" },
      { ...base, id: "m2", created_at: "2026-10-07T13:00:00Z", lead_first: "2026-10-07T12:00:00Z", rol: "cliente" },
      { ...base, id: "m3", rol: "bot" },
      { ...base, id: "m4", rol: "bot", lead_requiere: true },
    ]);
    expect(items.map((i) => i.kind)).toEqual([
      "nuevo_lead",
      "mensaje_cliente",
      "respuesta_bot",
      "derivado",
    ]);
    expect(items[0].text).toContain("Ana");
  });
});
