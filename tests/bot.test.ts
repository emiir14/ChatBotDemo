import { describe, expect, it } from "vitest";
import {
  buildUserContent,
  formatFinancing,
  formatKnownLead,
  formatPrice,
  isGeminiQuotaError,
  parseBotOutput,
  sanitizeReply,
} from "@/lib/bot";
import { activeFinancing, todayCordoba, type FinancingOption } from "@/lib/financing";
import {
  __clearRateLimits,
  consumeRateLimit,
  RATE_LIMIT_MAX_MESSAGES,
} from "@/lib/rate-limit";

describe("parseBotOutput", () => {
  it("acepta una salida completa válida", () => {
    const parsed = parseBotOutput(
      JSON.stringify({
        reply: "Hola, ¿en qué auto estás interesado?",
        lead_update: {
          nombre: "Juan",
          temperatura: "tibio",
          requiere_humano: false,
        },
      }),
    );
    expect(parsed.reply).toContain("Hola");
    expect(parsed.lead_update?.nombre).toBe("Juan");
  });

  it("acepta solo reply (lead_update opcional)", () => {
    const parsed = parseBotOutput(JSON.stringify({ reply: "¡Hola!" }));
    expect(parsed.reply).toBe("¡Hola!");
    expect(parsed.lead_update).toBeUndefined();
  });

  it("lanza con JSON inválido o temperatura inválida", () => {
    expect(() => parseBotOutput("no es json")).toThrow();
    expect(() =>
      parseBotOutput(
        JSON.stringify({ reply: "Hola", lead_update: { temperatura: "hirviendo" } }),
      ),
    ).toThrow();
    expect(() => parseBotOutput(JSON.stringify({}))).toThrow();
  });
});

describe("sanitizeReply + formatPrice + formatKnownLead", () => {
  it("quita markdown sin romper precios", () => {
    expect(sanitizeReply("La Hilux sale **USD 41.200**")).toBe(
      "La Hilux sale USD 41.200",
    );
  });
  it("formatea ARS y USD estilo es-AR", () => {
    expect(formatPrice(27800000, "ARS")).toContain("27.800.000");
    expect(formatPrice(41200, "USD")).toBe("USD 41.200");
  });
  it("resume lo conocido del lead sin inventar", () => {
    const text = formatKnownLead({
      id: "x",
      telefono: "549",
      nombre: "Ana",
      auto_interes: null,
      presupuesto: null,
      permuta: null,
      financiacion: null,
      urgencia: null,
      temperatura: null,
      requiere_humano: false,
      resumen: null,
      estado: "nuevo",
      origen_demo: false,
      first_message_at: null,
      last_customer_message_at: null,
      last_bot_reply_at: null,
      created_at: "",
      updated_at: "",
    });
    expect(text).toContain("Ana");
    expect(text).not.toContain("temperatura");
  });
});

describe("buildUserContent (zona horaria)", () => {
  it("inyecta el día de Córdoba aunque en UTC sea otro", () => {
    const content = buildUserContent(
      { lead: null, history: [], vehicles: [], newMessage: "Hola" },
      new Date("2026-10-07T02:30:00Z"),
    );
    expect(content).toContain("martes");
    expect(content).toContain("CÓRDOBA");
  });
  it("pone el stock antes que la fecha (caché) y escapa comillas", () => {
    const content = buildUserContent(
      { lead: null, history: [], vehicles: [], newMessage: 'Me dijo "20% off"' },
      new Date("2026-10-07T12:00:00Z"),
    );
    expect(content.indexOf("STOCK DISPONIBLE")).toBeLessThan(
      content.indexOf("FECHA Y HORA"),
    );
    expect(content).toContain('\\"20% off\\"');
  });
});

describe("isGeminiQuotaError", () => {
  it("distingue 429 de 5xx y de errores comunes", () => {
    expect(isGeminiQuotaError({ status: 429 })).toBe(true);
    expect(isGeminiQuotaError({ status: 503 })).toBe(false);
    expect(isGeminiQuotaError(new Error("x"))).toBe(false);
    expect(isGeminiQuotaError(null)).toBe(false);
  });
});

const PLAN: FinancingOption = {
  id: "p1",
  nombre: "12 cuotas fijas",
  entidad: "Banco Nación",
  tna: 27,
  cft: 45.2,
  cuotas_min: 12,
  cuotas_max: 12,
  anticipo_min_pct: 30,
  monto_max: 20000000,
  requisitos: "Recibo de sueldo",
  vigente_hasta: "2026-12-31",
  activo: true,
};

describe("activeFinancing", () => {
  it("filtra inactivos y vencidos (fecha Córdoba)", () => {
    const rows = activeFinancing(
      [
        PLAN,
        { ...PLAN, id: "p2", activo: false },
        { ...PLAN, id: "p3", vigente_hasta: "2026-01-01" },
        { ...PLAN, id: "p4", vigente_hasta: null },
      ],
      "2026-10-07",
    );
    expect(rows.map((r) => r.id)).toEqual(["p1", "p4"]);
  });
  it("todayCordoba devuelve AAAA-MM-DD", () => {
    expect(todayCordoba(new Date("2026-10-07T12:00:00Z"))).toBe("2026-10-07");
  });
});

describe("formatFinancing", () => {
  it("resume el plan con números exactos y avisa si no hay", () => {
    const text = formatFinancing([PLAN]);
    expect(text).toContain("12 cuotas fijas");
    expect(text).toContain("TNA 27%");
    expect(text).toContain("12 cuotas");
    expect(formatFinancing([])).toContain("derivá al asesor");
  });
  it("el contexto del bot incluye los planes", () => {
    const content = buildUserContent(
      { lead: null, history: [], vehicles: [], newMessage: "Hola", financing: [PLAN] },
      new Date("2026-10-07T12:00:00Z"),
    );
    expect(content).toContain("12 cuotas fijas");
  });
});

describe("consumeRateLimit", () => {
  it("permite 20 y bloquea el 21 dentro de la hora", () => {
    __clearRateLimits();
    const phone = "5493515550999";
    const now = Date.now();
    for (let i = 0; i < RATE_LIMIT_MAX_MESSAGES; i++) {
      expect(consumeRateLimit(phone, now + i * 1000)).toBe(true);
    }
    expect(consumeRateLimit(phone, now + 30 * 60 * 1000)).toBe(false);
    // Ventana vencida: permite de nuevo.
    expect(consumeRateLimit(phone, now + 61 * 60 * 1000)).toBe(true);
  });
});
