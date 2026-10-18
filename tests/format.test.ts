import { describe, expect, it } from "vitest";
import { splitColors } from "@/lib/format";

describe("splitColors (varios colores por vehículo)", () => {
  it("separa por coma, punto y coma, barra y pipe", () => {
    expect(splitColors("Blanco, Negro, Gris")).toEqual(["Blanco", "Negro", "Gris"]);
    expect(splitColors("Blanco;Negro")).toEqual(["Blanco", "Negro"]);
    expect(splitColors("Blanco / Negro")).toEqual(["Blanco", "Negro"]);
    expect(splitColors("Blanco|Negro")).toEqual(["Blanco", "Negro"]);
  });

  it("recorta espacios y descarta vacíos", () => {
    expect(splitColors("  Blanco ,, Negro  ")).toEqual(["Blanco", "Negro"]);
  });

  it("un solo color o vacío", () => {
    expect(splitColors("Blanco")).toEqual(["Blanco"]);
    expect(splitColors("")).toEqual([]);
    expect(splitColors(null)).toEqual([]);
    expect(splitColors(undefined)).toEqual([]);
  });
});
