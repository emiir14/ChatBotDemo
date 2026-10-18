import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Panel · ChatBotDemo",
  description: "Panel del dueño: leads de WhatsApp clasificados por IA.",
  appleWebApp: {
    capable: true,
    title: "ChatBotDemo",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#0d2118",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
