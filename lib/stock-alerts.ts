/**
 * Lógica PURA de alertas de stock (testeable, sin Supabase).
 *
 * Un cliente pregunta por un ítem que no está disponible → se guarda una
 * demanda. Cuando ese ítem ingresa al stock, la demanda se resuelve y el panel
 * muestra la alerta con la conversación donde se preguntó.
 *
 * El matcher es determinístico (no depende de un booleano de la IA):
 *   - Normaliza mayúsculas, acentos, puntuación y espacios.
 *   - Descarta palabras genéricas ("auto", "camioneta", "0km", años, etc.).
 *   - Compara los tokens del pedido contra marca + modelo + versión del auto.
 * Es tolerante a propósito: "Hilux" matchea "Toyota Hilux DX 2.4 TD".
 */

export interface VehicleLike {
  marca: string;
  modelo: string;
  version?: string | null;
}

/** Marcas frecuentes en Argentina: sirven para comparar modelo sin marca. */
const BRANDS = new Set([
  "toyota",
  "ford",
  "volkswagen",
  "vw",
  "fiat",
  "chevrolet",
  "renault",
  "peugeot",
  "citroen",
  "honda",
  "nissan",
  "jeep",
  "ram",
  "dodge",
  "hyundai",
  "kia",
  "mazda",
  "suzuki",
  "mitsubishi",
  "bmw",
  "mercedes",
  "benz",
  "audi",
  "chery",
  "geely",
  "haval",
  "jetour",
  "iveco",
  "scania",
  "land",
  "rover",
  "subaru",
  "volvo",
  "jac",
  "baic",
  "dfsk",
  "great",
  "wall",
]);

/**
 * Palabras que no identifican un modelo. Ojo: no incluir términos que sí son
 * versiones o modelos reales (GT, Sport, Cross, SI, etc.).
 */
const GENERIC = new Set([
  "auto",
  "autos",
  "coche",
  "coches",
  "carro",
  "camioneta",
  "camionetas",
  "pick",
  "pickup",
  "up",
  "suv",
  "sedan",
  "hatchback",
  "hatch",
  "familiar",
  "rural",
  "cabina",
  "doble",
  "simple",
  "usado",
  "usada",
  "usados",
  "usadas",
  "nuevo",
  "nueva",
  "nuevos",
  "nuevas",
  "cero",
  "km",
  "kilometro",
  "kilometros",
  "0km",
  "modelo",
  "modelos",
  "marca",
  "marcas",
  "version",
  "versiones",
  "unidad",
  "unidades",
  "quiero",
  "queria",
  "busco",
  "buscando",
  "necesito",
  "ando",
  "interesado",
  "interesada",
  "interesados",
  "interesadas",
  "por",
  "para",
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "de",
  "del",
  "al",
  "a",
  "en",
  "con",
  "sin",
  "y",
  "o",
  "u",
  "mi",
  "me",
  "te",
  "se",
  "que",
  "cual",
  "cuales",
  "como",
  "cuanto",
  "cuanta",
  "cuantos",
  "cuantas",
  "hay",
  "tiene",
  "tienen",
  "tenes",
  "precio",
  "precios",
  "presupuesto",
  "plata",
  "ano",
  "anio",
  "anos",
  "anios",
  "algun",
  "alguna",
  "sobre",
  "mas",
  "muy",
  "tambien",
  "pero",
  "no",
]);

/** Minúsculas, sin acentos, solo letras/números separados por un espacio. */
export function normalizeText(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSignificant(token: string): boolean {
  if (token.length < 2) return false;
  if (GENERIC.has(token)) return false;
  // Años (1990-2099) no identifican un modelo. Los números cortos sí pueden
  // serlo ("208", "1500"), por eso solo se descartan los años.
  if (/^(19|20)\d{2}$/.test(token)) return false;
  return true;
}

/** Tokens normalizados y significativos de un texto libre. */
export function tokenize(input: string): string[] {
  const normalized = normalizeText(input);
  if (!normalized) return [];
  return normalized.split(" ").filter(isSignificant);
}

/**
 * Clave estable de un ítem: sus tokens normalizados.
 * "Toyota Hilux DX 2.4" → "toyota hilux dx".
 */
export function itemKey(input: string): string {
  return tokenize(input).join(" ");
}

/** Texto para mostrar en el panel (conserva mayúsculas y marca). */
export function itemLabel(input: string): string {
  return input.replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Tokens del pedido sin la marca: "toyota hilux dx" → ["hilux", "dx"]. */
function demandModelTokens(key: string): string[] {
  return tokenize(key).filter((t) => !BRANDS.has(t));
}

/** Alias de marca para que "VW Amarok" matchee "Volkswagen Amarok". */
const BRAND_ALIASES: string[][] = [
  ["volkswagen", "vw"],
  ["mercedes", "benz"],
  ["chevrolet", "chevy"],
];

function brandsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  return BRAND_ALIASES.some(
    (group) => group.includes(a) && group.includes(b),
  );
}

/**
 * ¿El vehículo satisface la demanda? Compara el MODELO (no la versión):
 *   matchesItem("hilux", { marca:"Toyota", modelo:"Hilux", version:"DX 2.4" })  → true
 *   matchesItem("toyota hilux dx", { marca:"Toyota", modelo:"Hilux" })          → true
 *   matchesItem("corolla", { marca:"Toyota", modelo:"Corolla Cross" })          → false
 */
export function matchesItem(key: string, vehicle: VehicleLike): boolean {
  const demand = tokenize(key);
  if (demand.length === 0) return false;

  const demandBrands = demand.filter((token) => BRANDS.has(token));
  const vehicleBrands = tokenize(vehicle.marca).filter((token) => BRANDS.has(token));
  // Si el cliente nombró una marca, el auto tiene que ser de esa marca.
  if (
    demandBrands.length > 0 &&
    !demandBrands.some((db) => vehicleBrands.some((vb) => brandsMatch(db, vb)))
  ) {
    return false;
  }

  const demandModel = demandModelTokens(key);
  const vehicleModel = tokenize(vehicle.modelo);
  if (demandModel.length === 0 || vehicleModel.length === 0) return false;

  const demandModelStr = demandModel.join(" ");
  const vehicleModelStr = vehicleModel.join(" ");

  // Mismo modelo exacto ("Hilux" = "Hilux").
  if (demandModelStr === vehicleModelStr) return true;

  // El pedido es más específico que el modelo ("Hilux DX" ⊃ "Hilux"), pero los
  // tokens extra tienen que ser de la versión: así "Corolla Cross" no matchea
  // un Corolla sedán.
  if (demandModelStr.startsWith(`${vehicleModelStr} `)) {
    const extra = demandModel.slice(vehicleModel.length);
    const versionTokens = tokenize(vehicle.version ?? "");
    if (extra.length > 0 && extra.every((token) => versionTokens.includes(token))) {
      return true;
    }
  }

  // El auto tiene un modelo más específico, solo si el pedido trae 2+ tokens.
  // Evita confundir "Corolla" (sedán) con "Corolla Cross" (SUV).
  if (demandModel.length >= 2 && vehicleModelStr.startsWith(`${demandModelStr} `)) {
    return true;
  }

  return false;
}

/** Primer vehículo disponible que satisface la demanda. */
export function firstMatchingVehicle<T extends VehicleLike>(
  key: string,
  vehicles: T[],
): T | null {
  return vehicles.find((vehicle) => matchesItem(key, vehicle)) ?? null;
}

/**
 * ¿Dos claves describen el mismo ítem? Sirve para no duplicar la demanda
 * cuando el cliente dice "Hilux" y después "Toyota Hilux DX".
 */
export function sameItemKey(a: string, b: string): boolean {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.length === 0 || right.length === 0) return false;
  const [small, big] = left.length <= right.length ? [left, right] : [right, left];
  return small.every((token) => big.includes(token));
}
