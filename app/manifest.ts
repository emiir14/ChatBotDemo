import type { MetadataRoute } from "next";

/** Manifest PWA: necesario para instalar en el celular (obligatorio para push en iOS). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ChatBotDemo",
    short_name: "ChatBotDemo",
    description: "Panel del dueño: leads de WhatsApp clasificados por IA.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d2118",
    lang: "es",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
