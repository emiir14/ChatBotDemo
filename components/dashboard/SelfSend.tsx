"use client";

import { useEffect, useState, type JSX } from "react";
import { Send } from "lucide-react";

/** Botón "Enviarme WhatsApp": plantilla hello_world a tu celular (demo). */
export function SelfSend({ onToast }: { onToast: (msg: string) => void }): JSX.Element {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setPhone(localStorage.getItem("demo-phone") ?? "");
  }, []);

  async function send(): Promise<void> {
    const digits = phone.replace(/\D/g, "");
    if (!/^\d{8,15}$/.test(digits)) {
      onToast("Revisá el número (solo dígitos)");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/dashboard/self-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: digits }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo enviar");
      localStorage.setItem("demo-phone", digits);
      setOpen(false);
      onToast("Enviado. Revisá tu WhatsApp.");
    } catch (e) {
      onToast(e instanceof Error ? e.message : "No se pudo enviar");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(true)} title="Enviarte un WhatsApp de prueba">
        <Send size={15} aria-hidden="true" />
        <span className="hidden sm:inline">Enviarme WhatsApp</span>
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1.5 rounded-lg border border-(--line) bg-(--surface-2) px-2 py-1">
      <input
        className="input tnum w-36"
        style={{ minHeight: 34 }}
        inputMode="tel"
        placeholder="549351..."
        value={phone}
        autoFocus
        onChange={(e) => setPhone(e.target.value)}
        aria-label="Tu celular para la prueba"
      />
      <button className="btn btn-primary btn-sm" disabled={sending} onClick={send}>
        {sending ? "…" : "Enviar"}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Cancelar">
        ✕
      </button>
    </span>
  );
}
