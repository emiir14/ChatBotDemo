import { z } from "zod";

/**
 * Validación central de variables de entorno (solo servidor).
 * Los secretos NUNCA llevan prefijo NEXT_PUBLIC_.
 *
 * Las variables de Supabase las inyecta la integración de Vercel Marketplace
 * (verificables con `npx vercel env pull`). El código usa SUPABASE_URL +
 * SUPABASE_SECRET_KEY (service role). Se acepta el nombre legacy
 * SUPABASE_SERVICE_ROLE_KEY como fallback.
 */

const envSchema = z.object({
  // Supabase (inyectadas por la integración; en local vienen de .env.local)
  SUPABASE_URL: z.string().url("SUPABASE_URL debe ser una URL válida"),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // Gemini
  GEMINI_API_KEY: z.string().min(1, "GEMINI_API_KEY es obligatoria").optional(),
  GEMINI_MODEL: z.string().min(1).default("gemini-3.1-flash-lite"),

  // WhatsApp Cloud API
  WHATSAPP_TOKEN: z.string().min(1).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  WHATSAPP_API_VERSION: z.string().min(1).default("v24.0"),
  META_APP_SECRET: z.string().min(1).optional(),

  // Panel del dueño
  DASHBOARD_PASSWORD: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(1).optional(),

  // Concesionaria (no son secretos; tienen defaults para la demo)
  DEALERSHIP_NAME: z.string().min(1).default("AutoCórdoba"),
  DEALERSHIP_ADDRESS: z
    .string()
    .min(1)
    .default("Av. Colón 1234, Córdoba Capital"),
  DEALERSHIP_HOURS: z.string().min(1).default("Lun a Vie 9 a 18 h, Sáb 9 a 13 h"),
});

export type Env = z.infer<typeof envSchema> & {
  /** Service role key resuelta (nuevo nombre o fallback legacy). */
  SUPABASE_SERVICE_KEY: string;
};

let cached: Env | null = null;

/** Lee y valida process.env. Lanza un error claro si falta algo crítico. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `- ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Variables de entorno inválidas o faltantes:\n${details}\n(Revisá .env.example)`,
    );
  }
  const serviceKey =
    parsed.data.SUPABASE_SECRET_KEY ?? parsed.data.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY como fallback). " +
        "La inyecta la integración de Vercel Marketplace; verificala con `npx vercel env pull`.",
    );
  }
  cached = { ...parsed.data, SUPABASE_SERVICE_KEY: serviceKey };
  return cached;
}

/** Solo para tests: limpia la caché de getEnv(). */
export function __resetEnvCache(): void {
  cached = null;
}
