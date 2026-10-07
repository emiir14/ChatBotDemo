import { describe, expect, it } from "vitest";
import {
  buildTemplateCsv,
  diffImport,
  parseCsv,
  validateRows,
  type ExistingVehicle,
} from "@/lib/stock-import";
import { buildUserContent } from "@/lib/bot";

const EXISTING: ExistingVehicle[] = [
  {
    codigo: "STK-001",
    patente: null,
    marca: "Toyota",
    modelo: "Hilux",
    version: "DX",
    anio: 2025,
    km: 0,
    precio: 41200,
    moneda: "USD",
    combustible: "Diesel",
    transmision: "Manual",
    color: "Blanco",
    estado: "disponible",
    es_0km: true,
    descripcion: "",
  },
  {
    codigo: "STK-002",
    patente: "AA111BB",
    marca: "Fiat",
    modelo: "Cronos",
    version: "Drive",
    anio: 2023,
    km: 30000,
    precio: 20000000,
    moneda: "ARS",
    combustible: "Nafta",
    transmision: "Manual",
    color: "Gris",
    estado: "disponible",
    es_0km: false,
    descripcion: "",
  },
];

describe("parseCsv + plantilla", () => {
  it("la plantilla trae las columnas del esquema", () => {
    const header = buildTemplateCsv().split("\n")[0];
    for (const col of ["codigo", "marca", "modelo", "precio", "anio", "estado"]) {
      expect(header).toContain(col);
    }
  });
  it("parsea comas, punto y coma y comillas", () => {
    expect(parseCsv("a;b\n1;2")[0]).toEqual(["a", "b"]);
    expect(parseCsv('codigo,descripcion\nSTK-1,"Hola, mundo"')[1]).toEqual([
      "STK-1",
      "Hola, mundo",
    ]);
  });
});

describe("validateRows", () => {
  function rows(text: string): string[][] {
    return parseCsv(text);
  }
  it("acepta fila válida y detecta errores por fila", () => {
    const { valid, errors } = validateRows(
      rows("codigo,marca,modelo,precio,anio,moneda,estado,es_0km\nSTK-9,Ford,Ranger,39000,2025,USD,disponible,no"),
    );
    expect(errors).toEqual([]);
    expect(valid).toHaveLength(1);
    expect(valid[0].data.es_0km).toBe(false);
  });
  it("rechaza precio negativo, año absurdo y columnas faltantes", () => {
    const bad = validateRows(
      rows("codigo,marca,modelo,precio,anio\nSTK-9,Ford,Ranger,-5,1800"),
    );
    expect(bad.valid).toHaveLength(0);
    expect(bad.errors[0].fila).toBe(2);
    expect(bad.errors[0].errores.join(" ")).toContain("precio");
    const missing = validateRows(rows("marca,modelo\nFord,Ranger"));
    expect(missing.errors[0].errores.join(" ")).toContain("codigo");
  });
});

describe("diffImport", () => {
  it("separa nuevos, modificados y ausentes sin duplicar", () => {
    const { valid, errors } = validateRows(
      parseCsv(
        "codigo,marca,modelo,precio,anio,moneda,estado,es_0km\n" +
          "STK-001,Toyota,Hilux,42000,2025,USD,disponible,si\n" +
          "STK-001,Toyota,Hilux,42000,2025,USD,disponible,si\n" +
          "STK-003,VW,Polo,28000000,2025,ARS,disponible,no",
      ),
    );
    const preview = diffImport(valid, EXISTING, errors);
    expect(preview.nuevos.map((n) => n.data.codigo)).toEqual(["STK-003"]);
    expect(preview.modificados).toHaveLength(1);
    expect(preview.modificados[0].cambios).toContain("precio");
    expect(preview.ausentes.map((a) => a.codigo)).toEqual(["STK-002"]);
    expect(preview.duplicadosEnArchivo).toEqual(["STK-001"]);
  });
  it("sin cambios no marca modificado", () => {
    const { valid, errors } = validateRows(
      parseCsv(
        "codigo,patente,marca,modelo,version,anio,km,precio,moneda,combustible,transmision,color,estado,es_0km,descripcion\n" +
          "STK-001,,Toyota,Hilux,DX,2025,0,41200,USD,Diesel,Manual,Blanco,disponible,si,",
      ),
    );
    const preview = diffImport(valid, EXISTING.slice(0, 1), errors);
    expect(preview.modificados).toEqual([]);
    expect(preview.ausentes).toEqual([]);
  });
});

describe("buildUserContent (frescura de stock)", () => {
  const base = { lead: null, history: [], vehicles: [], newMessage: "Hola" };
  it("avisa si el stock lleva más de 3 días sin actualizar", () => {
    const content = buildUserContent(
      base,
      new Date("2026-10-07T12:00:00Z"),
      "2026-10-01T12:00:00Z",
    );
    expect(content).toContain("6 días sin actualizar");
  });
  it("no avisa con stock fresco ni sin dato", () => {
    expect(
      buildUserContent(base, new Date("2026-10-07T12:00:00Z"), "2026-10-06T12:00:00Z"),
    ).not.toContain("sin actualizar");
    expect(buildUserContent(base, new Date("2026-10-07T12:00:00Z"), null)).not.toContain(
      "sin actualizar",
    );
  });
});
