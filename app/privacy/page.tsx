import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Cómo tratamos los datos del chatbot de demostración.",
};

/** Página pública (el middleware solo protege /dashboard y /api/dashboard). */
export default function PrivacyPage(): React.JSX.Element {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Política de privacidad</h1>
      <p className="mt-1 text-sm text-(--ink-2)">Última actualización: octubre 2026</p>
      <div className="mt-4 flex flex-col gap-3 text-[0.95rem] leading-relaxed">
        <p>
          Este es un chatbot de demostración para concesionarias. Los mensajes
          que nos enviás por WhatsApp se usan únicamente para responder tus
          consultas sobre vehículos. Guardamos tu número de teléfono y el
          contenido de la conversación para dar seguimiento a tu consulta.
        </p>
        <p>
          No vendemos ni compartimos tus datos con terceros, salvo con los
          proveedores técnicos necesarios para operar el servicio (alojamiento,
          base de datos y API de mensajería). Podés pedir que borremos tus
          datos en cualquier momento escribiendo a:{" "}
          <a className="font-semibold underline" href="mailto:emirderespaldo@gmail.com">
            emirderespaldo@gmail.com
          </a>
          .
        </p>
        <p>
          Si escribís <strong>reiniciar demo</strong> al chatbot, tu historial
          y tus datos se borran de inmediato.
        </p>
      </div>
    </main>
  );
}
