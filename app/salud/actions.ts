"use server";

import { runHealthCheck, type HealthReport } from "@/lib/health";

/** Server action de /salud: corre el chequeo (deep=1 incluye la prueba real). */
export async function runHealth(deep: boolean): Promise<HealthReport> {
  return runHealthCheck(deep);
}
