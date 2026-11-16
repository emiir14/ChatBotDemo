import { describe, expect, it } from "vitest";
import {
  firstMatchingVehicle,
  itemKey,
  itemLabel,
  matchesItem,
  normalizeText,
  sameItemKey,
  tokenize,
} from "@/lib/stock-alerts";

const hilux = { marca: "Toyota", modelo: "Hilux", version: "DX 2.4 TD 4x2 MT" };
const corollaCross = {
  marca: "Toyota",
  modelo: "Corolla Cross",
  version: "XEI 2.0 HEV e-CVT",
};
const corolla = { marca: "Toyota", modelo: "Corolla", version: "XEI 2.0 CVT" };
const amarok = {
  marca: "Volkswagen",
  modelo: "Amarok",
  version: "Trendline V6 3.0 TDI 4Motion AT",
};
const ranger = { marca: "Ford", modelo: "Ranger", version: "XL 2.0 TD 4x2 MT" };
const ram = { marca: "Ram", modelo: "1500", version: "Laramie 5.7 V8" };

describe("normalizeText / tokenize / itemKey", () => {
  it("normaliza mayúsculas, acentos y puntuación", () => {
    expect(normalizeText("  Citroën C3 Aircross  ")).toBe("citroen c3 aircross");
  });

  it("descarta genéricos y años, pero conserva modelos numéricos", () => {
    expect(tokenize("Quiero una camioneta 0km 2025")).toEqual([]);
    expect(itemKey("Toyota Hilux DX 2.4 2025")).toBe("toyota hilux dx");
    expect(itemKey("Peugeot 208")).toBe("peugeot 208");
    expect(itemKey("Ram 1500")).toBe("ram 1500");
  });

  it("etiqueta el texto original sin espacios de más", () => {
    expect(itemLabel("  Toyota   Hilux  ")).toBe("Toyota Hilux");
  });
});

describe("matchesItem", () => {
  it("matchea por modelo aunque el cliente no diga la marca", () => {
    expect(matchesItem("hilux", hilux)).toBe(true);
    expect(matchesItem("Toyota Hilux", hilux)).toBe(true);
    expect(matchesItem("toyota hilux", hilux)).toBe(true);
  });

  it("matchea cuando el cliente agrega la versión", () => {
    expect(matchesItem("Hilux DX", hilux)).toBe(true);
    expect(matchesItem("Amarok V6", amarok)).toBe(true);
    expect(matchesItem("toyota hilux dx", hilux)).toBe(true);
  });

  it("no matchea otra marca ni otro modelo", () => {
    expect(matchesItem("toyota hilux", ranger)).toBe(false);
    expect(matchesItem("ranger", hilux)).toBe(false);
    expect(matchesItem("amarok", ranger)).toBe(false);
  });

  it("distingue Corolla de Corolla Cross", () => {
    expect(matchesItem("corolla", corolla)).toBe(true);
    expect(matchesItem("corolla", corollaCross)).toBe(false);
    expect(matchesItem("corolla cross", corollaCross)).toBe(true);
  });

  it("rechaza una versión que no está en el stock", () => {
    // Pidió Hilux SRX, pero solo hay DX: es otro ítem.
    expect(matchesItem("hilux srx", hilux)).toBe(false);
    // Pidió Ranger Raptor, pero solo hay XL.
    expect(matchesItem("ranger raptor", ranger)).toBe(false);
  });

  it("acepta alias de marca y modelos numéricos", () => {
    expect(matchesItem("VW Amarok", amarok)).toBe(true);
    expect(matchesItem("ram 1500", ram)).toBe(true);
    expect(matchesItem("dodge ram 1500", ram)).toBe(true);
  });

  it("no matchea pedidos demasiado vagos", () => {
    expect(matchesItem("toyota", hilux)).toBe(false);
    expect(matchesItem("auto", hilux)).toBe(false);
    expect(matchesItem("", hilux)).toBe(false);
  });
});

describe("sameItemKey", () => {
  it("considera el mismo ítem a 'Hilux' y 'Toyota Hilux DX'", () => {
    expect(sameItemKey("hilux", "toyota hilux dx")).toBe(true);
    expect(sameItemKey("toyota hilux", "hilux")).toBe(true);
  });

  it("no confunde versiones distintas", () => {
    expect(sameItemKey("hilux dx", "hilux srx")).toBe(false);
    // Corolla y Corolla Cross comparten la familia: para deduplicar alcanza.
    expect(sameItemKey("corolla", "corolla cross")).toBe(true);
  });
});

describe("firstMatchingVehicle", () => {
  it("devuelve el primer vehículo disponible que satisface el pedido", () => {
    const stock = [ranger, hilux, amarok];
    expect(firstMatchingVehicle("hilux dx", stock)).toBe(hilux);
    expect(firstMatchingVehicle("amarok", stock)).toBe(amarok);
    expect(firstMatchingVehicle("corolla", stock)).toBeNull();
  });
});
