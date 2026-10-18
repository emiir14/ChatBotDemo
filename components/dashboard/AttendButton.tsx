"use client";

import { useState, type JSX } from "react";
import { Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";

/** Botón "Atendido" que pide tipear quién atendió antes de confirmar. */
export function AttendButton({
  leadId,
  onDone,
  onError,
}: {
  leadId: string;
  onDone: () => void;
  onError: () => void;
}): JSX.Element {
  const [asking, setAsking] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm(atendidoPor: string): Promise<void> {
    const value = atendidoPor.trim();
    if (!value) return;
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, atendidoPor: value }),
      });
      if (!res.ok) throw new Error();
      setAsking(false);
      setName("");
      onDone();
    } catch {
      onError();
    } finally {
      setSaving(false);
    }
  }

  if (!asking) {
    return (
      <Button variant="ghost" size="sm" className="flex-1 sm:flex-none" onClick={() => setAsking(true)} tooltip="Sacar de la cola: registra quién lo atendió">
        <UserCheck size={14} aria-hidden="true" /> Atendido
      </Button>
    );
  }

  return (
    <span className="flex flex-1 flex-wrap items-center gap-1.5 sm:flex-none">
      <input
        className="input min-w-0 flex-1"
        style={{ minHeight: 36 }}
        placeholder="Nombre del agente"
        aria-label="Nombre del agente que atendió"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirm(name);
          if (e.key === "Escape") {
            setAsking(false);
            setName("");
          }
        }}
      />
      <Button variant="primary" size="sm" disabled={saving || !name.trim()} onClick={() => confirm(name)} tooltip="Confirmar el nombre de quien atendió">
        OK
      </Button>
      <Button variant="ghost" size="sm" disabled={saving} onClick={() => confirm("Revisado")} tooltip="Marcar el chat como revisado, sin agente">
        <Check size={14} aria-hidden="true" /> Revisado
      </Button>
    </span>
  );
}
