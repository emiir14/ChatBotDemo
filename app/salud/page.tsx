import type { Metadata } from "next";
import type { JSX } from "react";
import { SaludView } from "./SaludView";

export const metadata: Metadata = {
  title: "Salud del bot",
  description: "Chequeo en vivo de la demo.",
};

// El deep-run hace pings + una generación real: como la API de WhatsApp.
export const maxDuration = 60;

/** Página protegida por el middleware (misma sesión del dashboard). */
export default function SaludPage(): JSX.Element {
  return <SaludView />;
}
