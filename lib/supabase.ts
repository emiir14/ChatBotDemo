import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

/**
 * Cliente Supabase para uso EXCLUSIVO en el servidor (service role key).
 * Hace bypass de RLS: por eso las tablas no tienen políticas públicas.
 * NUNCA importar esto en componentes cliente ("use client").
 */

let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const env = getEnv();
  cached = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/** Solo para tests: limpia el singleton. */
export function __resetSupabaseCache(): void {
  cached = null;
}

// ---------------------------------------------------------------------------
// Tipos mínimos del dominio (Etapa 1). Se ampliarán en etapas siguientes.
// ---------------------------------------------------------------------------

export type VehicleEstado = "disponible" | "reservado" | "vendido";
export type LeadTemperatura = "caliente" | "tibio" | "frio";
export type LeadEstado = "nuevo" | "en_conversacion" | "derivado" | "recontactado";
export type MessageRol = "cliente" | "bot" | "sistema";

export interface Vehicle {
  id: string;
  marca: string;
  modelo: string;
  version: string;
  anio: number;
  km: number;
  precio: number;
  moneda: "ARS" | "USD";
  combustible: string;
  transmision: string;
  color: string;
  estado: VehicleEstado;
  es_0km: boolean;
  descripcion: string;
  created_at: string;
}

export interface Lead {
  id: string;
  telefono: string;
  nombre: string | null;
  auto_interes: string | null;
  presupuesto: string | null;
  permuta: string | null;
  financiacion: boolean | null;
  urgencia: string | null;
  temperatura: LeadTemperatura | null;
  requiere_humano: boolean;
  resumen: string | null;
  estado: LeadEstado;
  origen_demo: boolean;
  first_message_at: string | null;
  last_customer_message_at: string | null;
  last_bot_reply_at: string | null;
  created_at: string;
  updated_at: string;
}
