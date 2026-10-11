"use client";

import { useState, type JSX } from "react";
import { UserCheck } from "lucide-react";

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

  async function confirm(): Promise<void> {
    setSaving(true);
    try {
      const res = await fetch("/api/dashboard/attend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, atendidoPor: name.trim() || "dueño" }),
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
      <button className="btn btn-ghost btn-sm flex-1 sm:flex-none" onClick={() => setAsking(true)} title="Sacar de la cola: registra quién lo atendió">
        <UserCheck size={14} aria-hidden="true" /> Atendido
      </button>
    );
  }

  return (
    <span className="flex flex-1 items-center gap-1.5 sm:flex-none">
      <input
        className="input"
        style={{ minHeight: 36 }}
        placeholder="¿Quién atendió?"
        aria-label="Nombre de quien atendió"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") confirm();
          if (e.key === "Escape") setAsking(false);
        }}
      />
      <button className="btn btn-primary btn-sm" disabled={saving} onClick={confirm} title="Confirmar">
        OK
      </button>
    </span>
  );
}
