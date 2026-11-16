import { describe, expect, it } from "vitest";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/meta";
import {
  metaCredentialsFor,
  TenantCredentialsError,
  type Tenant,
} from "@/lib/tenant";

function tenant(overrides: Partial<Tenant> = {}): Tenant {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "astra",
    nombre: "Astra",
    direccion: "Av. Colón 1234",
    horarios: "Lun a Vie 9 a 18 h",
    telefono_contacto: null,
    whatsapp_phone_number_id: "1332851893247984",
    whatsapp_token: "token-del-tenant",
    whatsapp_verify_token: null,
    meta_app_secret: null,
    gemini_api_key: null,
    gemini_models: null,
    dashboard_password: null,
    activo: true,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("metaCredentialsFor", () => {
  it("usa el token y el phone_number_id del tenant", () => {
    expect(metaCredentialsFor(tenant())).toEqual({
      token: "token-del-tenant",
      phoneNumberId: "1332851893247984",
    });
  });

  it("recorta espacios de las credenciales", () => {
    expect(
      metaCredentialsFor(
        tenant({ whatsapp_token: "  token  ", whatsapp_phone_number_id: " 123 " }),
      ),
    ).toEqual({ token: "token", phoneNumberId: "123" });
  });

  it("falla explícitamente si el tenant no tiene token", () => {
    expect(() => metaCredentialsFor(tenant({ whatsapp_token: null }))).toThrow(
      TenantCredentialsError,
    );
  });

  it("falla explícitamente si el tenant no tiene phone_number_id", () => {
    expect(() =>
      metaCredentialsFor(tenant({ whatsapp_phone_number_id: "" })),
    ).toThrow(/whatsapp_phone_number_id/);
  });
});

describe("envíos sin credenciales del tenant", () => {
  it("texto: devuelve ok:false con el motivo, sin caer al entorno", async () => {
    const res = await sendWhatsAppText({
      to: "5493515550101",
      body: "hola",
      credentials: { token: "", phoneNumberId: "" },
    });
    expect(res.ok).toBe(false);
    expect(res.errorMessage).toMatch(/Credenciales de WhatsApp incompletas/);
  });

  it("plantilla: devuelve ok:false con el motivo, sin caer al entorno", async () => {
    const res = await sendWhatsAppTemplate({
      to: "5493515550101",
      credentials: { token: "token", phoneNumberId: "" },
    });
    expect(res.ok).toBe(false);
    expect(res.errorMessage).toMatch(/Credenciales de WhatsApp incompletas/);
  });
});
