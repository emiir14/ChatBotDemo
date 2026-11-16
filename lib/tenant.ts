import { getSupabaseAdmin } from "@/lib/supabase";
import type { MetaCredentials } from "@/lib/meta";

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

/** Error explícito: no hay ningún tenant activo en la base. */
export class TenantNotFoundError extends Error {
  constructor() {
    super(
      "No hay ningún tenant activo en public.tenants. " +
        "Corré la migración multitenant y verificá la columna activo.",
    );
    this.name = "TenantNotFoundError";
  }
}

/** Error explícito: el tenant no tiene credenciales de WhatsApp cargadas. */
export class TenantCredentialsError extends Error {
  constructor(
    readonly slug: string,
    readonly missing: string[],
  ) {
    super(
      `El tenant "${slug}" no tiene configurado ${missing.join(" y ")}. ` +
        "Cargalos en public.tenants: sin credenciales propias no se puede enviar.",
    );
    this.name = "TenantCredentialsError";
  }
}

/**
 * Credenciales de Meta del tenant. Sin fallback al entorno: si faltan, falla.
 * El phone_number_id y el token tienen que ser del MISMO número de WhatsApp.
 */
export function metaCredentialsFor(tenant: Tenant): MetaCredentials {
  const token = tenant.whatsapp_token?.trim();
  const phoneNumberId = tenant.whatsapp_phone_number_id?.trim();
  const missing: string[] = [];
  if (!token) missing.push("whatsapp_token");
  if (!phoneNumberId) missing.push("whatsapp_phone_number_id");
  if (!token || !phoneNumberId) {
    throw new TenantCredentialsError(tenant.slug, missing);
  }
  return { token, phoneNumberId };
}

function cacheTenant(cacheKey: string, tenant: Tenant): Tenant {
  tenantCache.set(cacheKey, { tenant, expiresAt: Date.now() + CACHE_TTL_MS });
  return tenant;
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

  return cacheTenant(cacheKey, data as Tenant);
}

/** Obtiene el tenant por su slug identificador (ej: 'astra'). Null si no existe. */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const cacheKey = `slug:${slug}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo buscar el tenant "${slug}": ${error.message}`);
  }
  if (!data) return null;
  return cacheTenant(cacheKey, data as Tenant);
}

/** Obtiene el tenant por su ID primario. Null si no existe. */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const cacheKey = `id:${id}`;
  const cached = tenantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.tenant;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo buscar el tenant ${id}: ${error.message}`);
  }
  if (!data) return null;
  return cacheTenant(cacheKey, data as Tenant);
}

/**
 * Obtiene el tenant principal (el más antiguo activo). Se usa en pantallas
 * que todavía no eligen tenant (panel de una sola concesionaria).
 * Si no hay ninguno, falla: no inventamos un tenant desde el entorno.
 */
export async function getDefaultTenant(): Promise<Tenant> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("activo", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No se pudo obtener el tenant por defecto: ${error.message}`);
  }
  if (!data) {
    throw new TenantNotFoundError();
  }
  return data as Tenant;
}

/** Lista todos los tenants activos (puede ser vacía). */
export async function listActiveTenants(): Promise<Tenant[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("tenants")
    .select("*")
    .eq("activo", true)
    .order("nombre", { ascending: true });

  if (error) {
    throw new Error(`No se pudieron listar los tenants activos: ${error.message}`);
  }
  return (data ?? []) as Tenant[];
}
