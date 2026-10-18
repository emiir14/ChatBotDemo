"use client";

import { useCallback, useEffect, useRef, useState, type JSX } from "react";
import useSWR from "swr";
import { Flame, MessageCircle, Send, X } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { AttendButton } from "./AttendButton";
import { TempBadge } from "./ui";
import { formatHourCordoba, formatPhone, timeAgo } from "@/lib/format";
import { isWithin24hWindow } from "@/lib/time";
import { WINDOW_EXPIRED_MESSAGE } from "./window-message";
import type { ChatMessage, LeadDetail } from "./types";

const fetcher = (url: string): Promise<{ lead: LeadDetail; messages: ChatMessage[] }> =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Error ${r.status}`);
    return r.json();
  });

function Timeline({ lead, messages }: { lead: LeadDetail; messages: ChatMessage[] }): JSX.Element {
  const firstBot = messages.find((m) => m.rol === "bot");
  const events: Array<{ label: string; at: string | null }> = [
    { label: "Primer mensaje del cliente", at: lead.first_message_at },
    { label: "Primera respuesta del bot", at: firstBot?.created_at ?? null },
  ];
  if (lead.requiere_humano) events.push({ label: "Derivado a asesor", at: lead.updated_at ?? lead.last_bot_reply_at });
  if (lead.atendido_at) {
    const revisado = lead.atendido_por === "Revisado";
    events.push({
      label: revisado ? "Chat revisado (sin agente)" : `Atendido${lead.atendido_por ? ` por ${lead.atendido_por}` : ""}`,
      at: lead.atendido_at,
    });
  }
  if (lead.recontactado_agente_at) {
    events.push({ label: "Recontactado por un agente (WhatsApp)", at: lead.recontactado_agente_at });
  } else if (lead.estado === "recontactado") {
    events.push({ label: "Recontactado por el bot", at: lead.last_bot_reply_at });
  }
  return (
    <ol className="flex flex-col gap-2 border-l-2 border-(--line) pl-3" aria-label="Línea de tiempo">
      {events.map((e, i) => (
        <li key={i} className="text-[0.83rem]">
          <span className="font-semibold">{e.label}</span>
          <br />
          <span className="tnum text-(--ink-2)">{e.at ? timeAgo(e.at) : "—"}</span>
        </li>
      ))}
    </ol>
  );
}

function RecontactBox({
  lead,
  onSent,
  onToast,
}: {
  lead: LeadDetail;
  onSent: () => void;
  onToast: (msg: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentState, setSentState] = useState<"idle" | "sent-sim" | "sent-real">("idle");
  const canSend = isWithin24hWindow(lead.last_customer_message_at);

  async function makeDraft(): Promise<void> {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/recontact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, step: "draft" }),
      });
      const data = (await res.json()) as { draft?: string };
      setDraft(data.draft ?? "");
    } catch {
      onToast("No se pudo generar el mensaje");
    } finally {
      setLoading(false);
    }
  }

  async function send(): Promise<void> {
    if (!draft?.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard/recontact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, step: "send", text: draft.trim() }),
      });
      const data = (await res.json()) as { ok?: boolean; simulated?: boolean; message?: string };
      if (res.status === 403) {
        onToast(data.message ?? WINDOW_EXPIRED_MESSAGE);
        return;
      }
      if (!res.ok || !data.ok) throw new Error();
      setSentState(data.simulated ? "sent-sim" : "sent-real");
      onSent();
      onToast(data.simulated ? "Envío simulado guardado" : "Mensaje enviado por WhatsApp");
    } catch {
      onToast("No se pudo enviar. Probá de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  if (sentState !== "idle") {
    return (
      <p className="badge badge-accent" role="status">
        <Send size={12} aria-hidden="true" />
        {sentState === "sent-sim" ? "Envío simulado (lead de demostración)" : "Enviado por WhatsApp"}
      </p>
    );
  }

  if (draft === null) {
    return (
      <Button
        variant="primary"
        size="sm"
        onClick={makeDraft}
        disabled={loading}
        tooltip="La IA redacta un seguimiento según el interés del lead"
      >
        <MessageCircle size={15} aria-hidden="true" />
        {loading ? "Generando…" : "Recontactar con IA"}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {lead.origen_demo && (
        <p className="text-xs font-semibold text-(--warm)">
          Lead de demostración: el envío será simulado, no sale por WhatsApp.
        </p>
      )}
      <label htmlFor="recontact-draft" className="text-xs font-semibold">
        Revisá y aprobá el mensaje antes de enviar
      </label>
      <textarea
        id="recontact-draft"
        className="textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={4}
      />
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          className="flex-1"
          onClick={send}
          disabled={loading || !draft.trim() || !canSend}
          tooltip={canSend ? "Enviar este mensaje por WhatsApp" : WINDOW_EXPIRED_MESSAGE}
        >
          <Send size={14} aria-hidden="true" />
          {loading ? "Enviando…" : "Enviar"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={loading} tooltip="Descartar el borrador">
          Cancelar
        </Button>
      </div>
      {!canSend && <p className="text-xs text-(--ink-2)">{WINDOW_EXPIRED_MESSAGE}</p>}
    </div>
  );
}

/** Drawer lateral con conversación, ficha, timeline y acciones. */
export function LeadDrawer({
  leadId,
  onClose,
  onAttended,
  onToast,
}: {
  leadId: string | null;
  onClose: () => void;
  onAttended: () => void;
  onToast: (msg: string) => void;
}): JSX.Element | null {
  const closeRef = useRef<HTMLButtonElement>(null);
  const { data, error, mutate } = useSWR(
    leadId ? `/api/dashboard/lead/${leadId}` : null,
    fetcher,
    { refreshInterval: leadId ? 4000 : 0, revalidateOnFocus: false },
  );

  const refresh = useCallback(() => mutate(), [mutate]);

  useEffect(() => {
    if (!leadId) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [leadId, onClose]);

  if (!leadId) return null;

  const waLink = data ? `https://wa.me/${data.lead.telefono.replace(/\D/g, "")}` : "#";

  function onWhatsApp(): void {
    if (!leadId) return;
    void fetch("/api/dashboard/recontact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId, step: "agente" }),
    })
      .then(() => {
        onAttended();
        refresh();
      })
      .catch(() => undefined);
  }

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Conversación del lead">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full flex-col bg-(--surface) shadow-xl sm:max-w-md">
        <div className="flex items-center gap-2 border-b border-(--line) p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{data?.lead.nombre ?? "Cargando…"}</p>
            {data && (
              <p className="tnum text-xs text-(--ink-2)">
                {formatPhone(data.lead.telefono)}
              </p>
            )}
          </div>
          {data?.lead && <TempBadge value={data.lead.temperatura} />}
          <Button ref={closeRef} variant="ghost" size="icon-sm" onClick={onClose} aria-label="Cerrar conversación" tooltip="Cerrar (o tecla Escape)">
            <X size={16} aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {error ? (
            <p role="alert" className="text-sm text-(--danger)">
              No se pudo cargar.{" "}
              <Button variant="ghost" size="xs" onClick={() => refresh()} tooltip="Volver a intentar la carga">
                Reintentar
              </Button>
            </p>
          ) : !data ? (
            <div className="flex flex-col gap-2" aria-hidden="true">
              <div className="skeleton h-14 w-3/4" />
              <div className="skeleton h-14 w-2/3 self-end" />
              <div className="skeleton h-14 w-3/4" />
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-1.5" aria-label="Conversación">
                {data.messages.map((m) => (
                  <div key={m.id} className={`bubble ${m.rol === "cliente" ? "bubble-me" : "bubble-bot"}`}>
                    {m.texto}
                    {m.rol === "bot" && !m.wa_message_id && (
                      <span className="mt-1 block text-[0.7rem] font-semibold text-(--danger)">
                        No llegó a WhatsApp (rechazado por Meta)
                      </span>
                    )}
                    <time>{formatHourCordoba(m.created_at)}</time>
                  </div>
                ))}
              </div>

              <div className="card mb-3 p-3.5">
                <h3 className="mb-2 text-sm font-bold">Ficha del lead</h3>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[0.83rem]">
                  <dt className="text-(--ink-2)">Interés</dt>
                  <dd className="font-semibold">{data.lead.auto_interes ?? "—"}</dd>
                  <dt className="text-(--ink-2)">Presupuesto</dt>
                  <dd className="tnum">{data.lead.presupuesto ?? "—"}</dd>
                  <dt className="text-(--ink-2)">Permuta</dt>
                  <dd>{data.lead.permuta ?? "—"}</dd>
                  <dt className="text-(--ink-2)">Financiación</dt>
                  <dd>{data.lead.financiacion === null ? "—" : data.lead.financiacion ? "Sí" : "No"}</dd>
                  <dt className="text-(--ink-2)">Urgencia</dt>
                  <dd>{data.lead.urgencia ?? "—"}</dd>
                </dl>
                {data.lead.resumen && (
                  <p className="mt-2 border-t border-(--line) pt-2 text-[0.83rem]">
                    <strong>Resumen:</strong> {data.lead.resumen}
                  </p>
                )}
                <div className="mt-3">
                  <Timeline lead={data.lead} messages={data.messages} />
                </div>
              </div>
            </>
          )}
        </div>

        {data && !error && (
          <div className="flex shrink-0 flex-col gap-2 border-t border-(--line) bg-(--surface) p-3">
            <RecontactBox lead={data.lead} onSent={refresh} onToast={onToast} />
            <div className="flex flex-wrap gap-2">
              <ButtonLink
                variant="ghost"
                size="sm"
                className="flex-1"
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onWhatsApp}
                tooltip="Continuar vos la charla desde tu WhatsApp (queda registrado como recontacto por agente)"
              >
                <MessageCircle size={14} aria-hidden="true" /> WhatsApp
              </ButtonLink>
              {!data.lead.atendido_at && (
                <AttendButton
                  leadId={data.lead.id}
                  onDone={() => {
                    onToast("Guardado");
                    onAttended();
                    refresh();
                  }}
                  onError={() => onToast("No se pudo marcar. Probá de nuevo.")}
                />
              )}
            </div>
            {data.lead.requiere_humano && !data.lead.atendido_at && (
              <p className="flex items-center gap-1.5 text-xs font-semibold text-(--hot)">
                <Flame size={13} aria-hidden="true" /> Este lead pidió un asesor.
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
