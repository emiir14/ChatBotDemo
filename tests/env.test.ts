import { afterEach, describe, expect, it, vi } from "vitest";
import { __resetEnvCache, getEnv } from "@/lib/env";

const BASE_ENV = {
  SUPABASE_URL: "https://xyzcompany.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  GEMINI_MODEL: "gemini-3.1-flash-lite",
  WHATSAPP_API_VERSION: "v24.0",
  DEALERSHIP_NAME: "AutoCórdoba",
  DEALERSHIP_ADDRESS: "Av. Colón 1234, Córdoba Capital",
  DEALERSHIP_HOURS: "Lun a Vie 9 a 18 h, Sáb 9 a 13 h",
} as const;

function setEnv(vars: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) {
      vi.stubEnv(key, "");
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  __resetEnvCache();
});

describe("getEnv", () => {
  it("aplica los defaults de modelo, API version y concesionaria", () => {
    setEnv({ ...BASE_ENV });
    const env = getEnv();
    expect(env.GEMINI_MODEL).toBe("gemini-3.1-flash-lite");
    expect(env.WHATSAPP_API_VERSION).toBe("v24.0");
    expect(env.DEALERSHIP_NAME).toBe("AutoCórdoba");
    expect(env.SUPABASE_SERVICE_KEY).toBe("sb_secret_test");
  });

  it("acepta la service key con el nombre legacy", () => {
    setEnv({
      ...BASE_ENV,
      SUPABASE_SECRET_KEY: undefined,
      SUPABASE_SERVICE_ROLE_KEY: "legacy-key",
    });
    expect(getEnv().SUPABASE_SERVICE_KEY).toBe("legacy-key");
  });

  it("lanza un error claro si falta la service key", () => {
    setEnv({ ...BASE_ENV, SUPABASE_SECRET_KEY: undefined });
    expect(() => getEnv()).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it("permite cambiar el modelo Gemini sin tocar código", () => {
    setEnv({ ...BASE_ENV, GEMINI_MODEL: "gemini-3.5-flash-lite" });
    expect(getEnv().GEMINI_MODEL).toBe("gemini-3.5-flash-lite");
  });

  it("DEMO_MODE es 'false' por defecto (seguro en producción)", () => {
    const env = { ...BASE_ENV };
    delete (env as Record<string, unknown>).DEMO_MODE;
    setEnv(env as Record<string, string | undefined>);
    expect(getEnv().DEMO_MODE).toBe("false");
  });
});
