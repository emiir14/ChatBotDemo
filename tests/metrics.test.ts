import { describe, expect, it } from "vitest";
import {
  buildFunnel,
  buildInsights,
  median,
  periodRange,
  previousRange,
  startOfCordobaDay,
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
