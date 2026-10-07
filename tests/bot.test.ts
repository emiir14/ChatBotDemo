import { describe, expect, it } from "vitest";
import {
  buildUserContent,
  formatKnownLead,
  formatPrice,
  parseBotOutput,
  sanitizeReply,
} from "@/lib/bot";
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
