import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetEnvCache } from "@/lib/env";

afterEach(() => {
  vi.unstubAllEnvs();
  __resetEnvCache();
});
import {
  extractIncomingMessages,
  isRestartCommand,
  isValidVerifyRequest,
  maskPhone,
  shouldHandleRestart,
  signBody,
  verifyMetaSignature,
} from "@/lib/whatsapp";
import { buildReadReceiptBody, buildTemplateBody, normalizeArPhone, normalizePhoneForMeta } from "@/lib/meta";

const SECRET = "test-app-secret";

function metaPayload(overrides: {
  messages?: Array<Record<string, unknown>>;
  statuses?: Array<Record<string, unknown>>;
}): unknown {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "pid" },
              contacts: [
                { profile: { name: "Juan" }, wa_id: "5493515550101" },
              ],
              messages: overrides.messages,
              statuses: overrides.statuses,
            },
          },
        ],
      },
    ],
  };
}

describe("verifyMetaSignature", () => {
  it("acepta una firma válida", () => {
    const body = '{"hola":"mundo"}';
    const sig = signBody(body, SECRET);
    expect(
      verifyMetaSignature({
        rawBody: body,
        signatureHeader: sig,
        appSecret: SECRET,
      }),
    ).toBe(true);
  });

  it("rechaza body adulterado, secreto incorrecto y firma malformada", () => {
    const body = '{"hola":"mundo"}';
    const sig = signBody(body, SECRET);
    expect(
      verifyMetaSignature({
        rawBody: '{"hola":"otro"}',
        signatureHeader: sig,
        appSecret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMetaSignature({
        rawBody: body,
        signatureHeader: sig,
        appSecret: "otro-secreto",
      }),
    ).toBe(false);
    expect(
      verifyMetaSignature({
        rawBody: body,
        signatureHeader: "no-es-firma",
        appSecret: SECRET,
      }),
    ).toBe(false);
    expect(
      verifyMetaSignature({ rawBody: body, signatureHeader: null, appSecret: SECRET }),
    ).toBe(false);
  });
});

describe("extractIncomingMessages", () => {
  it("extrae mensajes de texto con nombre del contacto", () => {
    const msgs = extractIncomingMessages(
      metaPayload({
        messages: [
          {
            from: "5493515550101",
            id: "wamid.1",
            timestamp: "1720000000",
            type: "text",
            text: { body: "Hola" },
          },
        ],
      }),
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({
      from: "5493515550101",
      waId: "wamid.1",
      kind: "text",
      body: "Hola",
      senderName: "Juan",
    });
  });

  it("ignora notificaciones de estado y eventos sin mensajes", () => {
    expect(
      extractIncomingMessages(metaPayload({ statuses: [{ id: "x" }] })),
    ).toEqual([]);
    expect(extractIncomingMessages(metaPayload({}))).toEqual([]);
    expect(extractIncomingMessages({ basura: true })).toEqual([]);
  });

  it("marca no-textuales con su tipo", () => {
    const msgs = extractIncomingMessages(
      metaPayload({
        messages: [
          { from: "5493515550101", id: "wamid.2", timestamp: "1720000000", type: "audio" },
        ],
      }),
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].kind).toBe("other");
    expect(msgs[0].otherType).toBe("audio");
  });
});

describe("isRestartCommand", () => {
  it("detecta 'reiniciar demo' sin importar mayúsculas ni espacios", () => {
    expect(isRestartCommand("reiniciar demo")).toBe(true);
    expect(isRestartCommand("  Reiniciar Demo  ")).toBe(true);
    expect(isRestartCommand("REINICIAR DEMO")).toBe(true);
  });
  it("no confunde frases parecidas", () => {
    expect(isRestartCommand("quiero reiniciar demo porfa")).toBe(false);
    expect(isRestartCommand("reiniciar")).toBe(false);
  });
});

describe("isValidVerifyRequest + maskPhone", () => {
  it("valida modo, token y secreto configurado", () => {
    expect(
      isValidVerifyRequest({ mode: "subscribe", token: "abc", expectedToken: "abc" }),
    ).toBe(true);
    expect(
      isValidVerifyRequest({ mode: "subscribe", token: "otro", expectedToken: "abc" }),
    ).toBe(false);
    expect(
      isValidVerifyRequest({ mode: "subscribe", token: "abc", expectedToken: undefined }),
    ).toBe(false);
  });
  it("enmascara el teléfono en logs", () => {
    expect(maskPhone("5493515550101")).toBe("...0101");
  });
});

describe("buildReadReceiptBody (typing indicator)", () => {
  it("usa el formato oficial de Meta: read + typing_indicator", () => {
    expect(buildReadReceiptBody("wamid.123")).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.123",
      typing_indicator: { type: "text" },
    });
  });
});

describe("buildTemplateBody (plantilla hello_world)", () => {
  it("arma el body oficial para envío fuera de ventana (con 9 normalizado)", () => {
    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "k");
    vi.stubEnv("NORMALIZE_AR_PHONE", "true");
    try {
      expect(buildTemplateBody({ to: "5493515550101" })).toEqual({
        messaging_product: "whatsapp",
        to: "543515550101",
        type: "template",
        template: { name: "hello_world", language: { code: "en_US" } },
      });
    } finally {
      vi.unstubAllEnvs();
      __resetEnvCache();
    }
  });
  it("respeta NORMALIZE_AR_PHONE=false (número real)", () => {
    vi.stubEnv("SUPABASE_URL", "https://xyz.supabase.co");
    vi.stubEnv("SUPABASE_SECRET_KEY", "k");
    vi.stubEnv("NORMALIZE_AR_PHONE", "false");
    try {
      expect(normalizePhoneForMeta("5493515550101")).toBe("5493515550101");
    } finally {
      vi.unstubAllEnvs();
      __resetEnvCache();
    }
  });
});

describe("normalizeArPhone (lista permitida de Meta)", () => {
  it("saca el 9 a móviles AR y deja el resto igual", () => {
    expect(normalizeArPhone("5493517887715")).toBe("543517887715");
    expect(normalizeArPhone("543517887715")).toBe("543517887715");
    expect(normalizeArPhone("15556407919")).toBe("15556407919");
  });
});

describe("shouldHandleRestart (gate DEMO_MODE)", () => {
  it("solo actúa con texto + comando + DEMO_MODE=true", () => {
    expect(
      shouldHandleRestart({ text: "reiniciar demo", kind: "text", demoMode: true }),
    ).toBe(true);
    expect(
      shouldHandleRestart({ text: "reiniciar demo", kind: "text", demoMode: false }),
    ).toBe(false);
    expect(
      shouldHandleRestart({ text: "reiniciar demo", kind: "other", demoMode: true }),
    ).toBe(false);
    expect(
      shouldHandleRestart({ text: "hola", kind: "text", demoMode: true }),
    ).toBe(false);
  });
});
