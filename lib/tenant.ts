import { getSupabaseAdmin } from "@/lib/supabase";
import { getEnv } from "@/lib/env";

export interface Tenant {
  id: string;
  slug: string;
  nombre: string;
  direccion: string;
  horarios: string;
  telefono_contacto: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_token: string | null;
  whatsapp_verify_token: string | null;
  meta_app_secret: string | null;
  gemini_api_key: string | null;
  gemini_models: string | null;
  dashboard_password: string | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

// Caché en memoria para no consultar la base en cada mensaje si no cambió
const tenantCache = new Map<string, { tenant: Tenant; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

/**
 * Tenant de fallback construido con las variables de entorno actuales.
 * Garantiza que el sistema siga funcionando al 100% incluso si todavía
 * no se corrió la migración SQL de tenants.
 */
export function buildEnvTenant(): Tenant {
  let env: ReturnType<typeof getEnv> | undefined;
  try {
    env = getEnv();
  } catch {
    env = undefined;
  }

  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "astra",
    nombre: env?.DEALERSHIP_NAME ?? "Astra Automotores",
    direccion: env?.DEALERSHIP_ADDRESS ?? "Olmos 1014",
    horarios:
      env?.DEALERSHIP_HOURS ??
      "Lunes a viernes de 9 a 18 hs, sábados de 9 a 13 hs",
    telefono_contacto: null,
    whatsapp_phone_number_id: env?.WHATSAPP_PHONE_NUMBER_ID ?? null,
    whatsapp_token: env?.WHATSAPP_TOKEN ?? null,
    whatsapp_verify_token: env?.WHATSAPP_VERIFY_TOKEN ?? null,
    meta_app_secret: env?.META_APP_SECRET ?? null,
    gemini_api_key: env?.GEMINI_API_KEY ?? null,
    gemini_models: env?.GEMINI_MODELS ?? null,
    dashboard_password: env?.DASHBOARD_PASSWORD ?? null,
    activo: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** Error explícito: el número de WhatsApp no tiene tenant configurado. */
export class TenantNotConfiguredError extends Error {
  constructor(readonly phoneNumberId: string) {
    super(
      `No hay un tenant activo con whatsapp_phone_number_id=${phoneNumberId}. ` +
        "Configuralo en la tabla public.tenants (migración multitenant).",
    );
    this.name = "TenantNotConfiguredError";
  }
}

/**
 * Obtiene el tenant por su WhatsApp Phone Number ID (el que llega en el webhook de Meta).
 * Si el número no está configurado, lanza TenantNotConfiguredError: preferimos
 * fallar de forma visible antes que procesar el mensaje con otro tenant.
 */
export async function getTenantByPhoneNumberId(
  phoneNumberId: string,
): Promise<Tenant> {
  const cacheKey = `phone:${phoneNumberId}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("whatsapp_phone_number_id", phoneNumberId)
    .eq("activo", true)
    .maybeSingle();

  if (error) {
    throw new Error(
      `No se pudo resolver el tenant para phone_number_id=${phoneNumberId}: ${error.message}`,
    );
  }
  if (!data) {
    throw new TenantNotConfiguredError(phoneNumberId);
  }

  const tenant = data as Tenant;
  tenantCache.set(cacheKey, {
    tenant,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
  return tenant;
}

/**
 * Obtiene el tenant por su slug identificador (ej: 'astra').
 */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const cacheKey = `slug:${slug}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();

    if (!error && data) {
      const tenant = data as Tenant;
      tenantCache.set(cacheKey, {
        tenant,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return tenant;
    }
  } catch {
    // Si la tabla tenants aún no existe
  }

  const fallback = buildEnvTenant();
  if (fallback.slug === slug) return fallback;
  return null;
}

/**
 * Obtiene el tenant por su ID primario.
 */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const cacheKey = `id:${id}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!error && data) {
      const tenant = data as Tenant;
      tenantCache.set(cacheKey, {
        tenant,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });
      return tenant;
    }
  } catch {
    // Fallback si la tabla no existe
  }

  const fallback = buildEnvTenant();
  if (fallback.id === id) return fallback;
  return null;
}

/**
 * Obtiene el tenant principal / por defecto.
 */
export async function getDefaultTenant(): Promise<Tenant> {
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("activo", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      return data as Tenant;
    }
  } catch {
    // Fallback si no está creada la tabla
  }

  return buildEnvTenant();
}

/**
 * Lista todos los tenants activos.
 */
export async function listActiveTenants(): Promise<Tenant[]> {
  const supabase = getSupabaseAdmin();
  try {
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("activo", true)
      .order("nombre", { ascending: true });

    if (!error && data && data.length > 0) {
      return data as unknown as Tenant[];
    }
  } catch {
    // Fallback
  }

  return [buildEnvTenant()];
}
