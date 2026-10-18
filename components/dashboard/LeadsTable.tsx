"use client";

import { useRef, useState, type JSX, type ReactNode } from "react";
import { Bot, Check, ChevronDown, Flame, Search, Trash2, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, TempBadge } from "./ui";
import { formatPhone, timeAgo } from "@/lib/format";
import type { LeadRow, LeadEstado, Temperatura } from "./types";

export type LeadSortKey = "actividad" | "nombre" | "interes" | "temperatura" | "atendido";
export type LeadSortDir = "asc" | "desc";
export type AtendidoFiltro = "all" | "asesor" | "atendido" | "revisado" | "sin_atender";
export type RecontactoFiltro = "all" | "bot" | "agente";

export interface LeadFilters {
  temperatura: "all" | Temperatura;
  estado: "all" | LeadEstado;
  atendido: AtendidoFiltro;
  recontacto: RecontactoFiltro;
  q: string;
  sort: LeadSortKey;
  dir: LeadSortDir;
  page: number;
}

const ESTADO_OPTS: Array<{ v: LeadFilters["estado"]; label: string }> = [
  { v: "all", label: "Todas las etapas" },
  { v: "nuevo", label: "Nuevos" },
  { v: "en_conversacion", label: "En conversación" },
  { v: "derivado", label: "Derivados" },
  { v: "recontactado", label: "Recontactados" },
];

const TEMP_OPTS: Array<{ v: LeadFilters["temperatura"]; label: string }> = [
  { v: "all", label: "Todas las temperaturas" },
  { v: "caliente", label: "Calientes" },
  { v: "tibio", label: "Tibios" },
  { v: "frio", label: "Fríos" },
];

const ATENDIDO_OPTS: Array<{ v: AtendidoFiltro; label: string }> = [
  { v: "all", label: "Todos" },
  { v: "asesor", label: "Pidió asesor" },
  { v: "atendido", label: "Atendidos por un agente" },
  { v: "revisado", label: "Revisados" },
  { v: "sin_atender", label: "Sin revisar ni atender" },
];

const RECONTACTO_OPTS: Array<{ v: RecontactoFiltro; label: string }> = [
  { v: "all", label: "Todos los recontactos" },
  { v: "bot", label: "Recontacto por bot" },
  { v: "agente", label: "Recontacto por agente" },
];

function LeadMeta({ lead }: { lead: LeadRow }): JSX.Element {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-(--ink-2)">
      <span className="tnum">{formatPhone(lead.telefono)}</span>
      {lead.auto_interes && <span className="font-semibold text-(--ink)">{lead.auto_interes}</span>}
      {lead.presupuesto && <span className="tnum">{lead.presupuesto}</span>}
      {lead.permuta && <span>Permuta</span>}
      <span>{timeAgo(lead.last_customer_message_at ?? lead.created_at)}</span>
      {lead.estado === "recontactado" && (
        <span className="font-semibold">
          {lead.recontactado_agente_at ? "Recontacto: agente" : "Recontacto: bot"}
        </span>
      )}
    </div>
  );
}

function MenuItem({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[0.8rem] transition-colors hover:bg-(--accent-soft) hover:text-(--accent-strong) ${
        selected ? "bg-(--accent-soft) font-bold text-(--accent-strong)" : ""
      }`}
    >
      {label}
      {selected && <Check size={13} aria-hidden="true" />}
    </button>
  );
}

/** Encabezado de columna: solo filtros propios de la columna (sin orden). */
function ColumnHead({
  label,
  title,
  children,
}: {
  label: string;
  title: string;
  children?: ReactNode;
}): JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  function toggle(): void {
    if (pos) {
      setPos(null);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ x: Math.min(r.left, window.innerWidth - 220), y: r.bottom + 4 });
  }

  function close(): void {
    setPos(null);
  }

  if (!children) {
    return (
      <th scope="col" className="whitespace-nowrap px-3 py-2 font-bold">
        {label}
      </th>
    );
  }

  return (
    <th scope="col" className="px-3 py-2 font-bold">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1 whitespace-nowrap hover:text-(--ink)"
        title={title}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
      >
        {label}
        <ChevronDown size={12} aria-hidden="true" className="text-(--ink-3)" />
      </button>
      {pos && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-hidden="true"
            tabIndex={-1}
            onClick={close}
          />
          <div
            role="menu"
            className="fixed z-50 min-w-[13rem] rounded-lg border border-(--line) bg-(--surface) p-1.5 text-xs normal-case tracking-normal shadow-xl"
            style={{ left: pos.x, top: pos.y }}
          >
            {children}
          </div>
        </>
      )}
    </th>
  );
}

/** Tabla de leads (escritorio) + tarjetas apiladas (móvil). */
export function LeadsTable({
  items,
  total,
  page,
  pageSize,
  filters,
  onFilters,
  onOpen,
  onDelete,
  newIds,
}: {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: LeadFilters;
  onFilters: (f: LeadFilters) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  newIds: Set<string>;
}): JSX.Element {
  const [q, setQ] = useState(filters.q);
  const [confirm, setConfirm] = useState<LeadRow | null>(null);
  const debounce = useRef(0);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function changeQ(value: string): void {
    setQ(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => onFilters({ ...filters, q: value, page: 1 }), 300);
  }

  return (
    <div>
      <div className="mb-3">
        <div className="relative">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ink-3)" />
          <input
            className="input pl-9"
            placeholder="Buscar por cualquier dato: nombre, teléfono, modelo, color, etapa…"
            title="Busca por palabras en todas las columnas. Escribí y filtra solo."
            value={q}
            onChange={(e) => changeQ(e.target.value)}
            aria-label="Buscar leads por palabras en todas las columnas"
          />
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-6 text-center">
          <p className="text-sm text-(--ink-2)">
            No hay leads con estos filtros. Probá ampliando el período o limpiando la búsqueda.
          </p>
        </div>
      ) : (
        <>
          {/* Escritorio: tabla */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-(--line) text-xs uppercase tracking-wide text-(--ink-2)">
                  <ColumnHead label="Lead" title="Nombre y teléfono. Filtrá por etapa o por tipo de recontacto">
                    {ESTADO_OPTS.map((o) => (
                      <MenuItem key={o.v} label={o.label} selected={filters.estado === o.v} onClick={() => onFilters({ ...filters, estado: o.v, page: 1 })} />
                    ))}
                    <div className="mt-1 border-t border-(--line) pt-1">
                      <p className="px-2 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-(--ink-3)">Recontacto</p>
                      {RECONTACTO_OPTS.map((o) => (
                        <MenuItem key={o.v} label={o.label} selected={filters.recontacto === o.v} onClick={() => onFilters({ ...filters, recontacto: o.v, page: 1 })} />
                      ))}
                    </div>
                  </ColumnHead>
                  <ColumnHead label="Interés" title="Modelo que le interesa y su presupuesto" />
                  <ColumnHead label="Temperatura" title="Qué tan cerca está de comprar">
                    {TEMP_OPTS.map((o) => (
                      <MenuItem key={o.v} label={o.label} selected={filters.temperatura === o.v} onClick={() => onFilters({ ...filters, temperatura: o.v, page: 1 })} />
                    ))}
                  </ColumnHead>
                  <ColumnHead label="Atendido por" title="Asesor, agente que atendió o si el chat fue revisado">
                    {ATENDIDO_OPTS.map((o) => (
                      <MenuItem key={o.v} label={o.label} selected={filters.atendido === o.v} onClick={() => onFilters({ ...filters, atendido: o.v, page: 1 })} />
                    ))}
                  </ColumnHead>
                  <ColumnHead label="Actividad" title="Cuándo fue su último mensaje" />
                  <th scope="col" className="px-3 py-2">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => onOpen(l.id)}
                    onKeyDown={(e) => e.key === "Enter" && onOpen(l.id)}
                    tabIndex={0}
                    title="Abrir la conversación completa"
                    className={`cursor-pointer border-b border-(--line) last:border-0 hover:bg-(--surface-3) ${newIds.has(l.id) ? "row-new" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <span className="font-semibold">{l.nombre ?? "Sin nombre"}</span>
                      <br />
                      <span className="tnum text-xs text-(--ink-2)">
                        {formatPhone(l.telefono)}
                      </span>
                      {l.estado === "recontactado" && (
                        <div className="mt-1">
                          {l.recontactado_agente_at ? (
                            <span className="badge badge-neutral" title="Recontactado por un agente (botón WhatsApp)">
                              <UserCheck size={12} aria-hidden="true" /> Recontacto agente
                            </span>
                          ) : (
                            <span className="badge badge-neutral" title="Recontactado por el bot">
                              <Bot size={12} aria-hidden="true" /> Recontacto bot
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {l.auto_interes ?? <span className="text-(--ink-3)">—</span>}
                      {l.presupuesto && <div className="tnum text-xs text-(--ink-2)">{l.presupuesto}</div>}
                    </td>
                    <td className="px-3 py-2.5"><TempBadge value={l.temperatura} /></td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col items-start gap-1">
                        {l.requiere_humano && (
                          <span className="badge badge-hot" title="Pidió un asesor humano">
                            <Flame size={12} aria-hidden="true" /> Asesor
                          </span>
                        )}
                        {l.atendido_por === "Revisado" ? (
                          <span className="badge badge-neutral" title="El chat fue revisado, sin agente asignado">
                            <Check size={12} aria-hidden="true" /> Revisado
                          </span>
                        ) : l.atendido_por ? (
                          <span className="text-sm font-semibold">{l.atendido_por}</span>
                        ) : (
                          !l.requiere_humano && <span className="text-(--ink-3)">—</span>
                        )}
                      </div>
                    </td>
                    <td className="tnum px-3 py-2.5 text-xs text-(--ink-2)">
                      {timeAgo(l.last_customer_message_at ?? l.created_at)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirm(l);
                        }}
                        aria-label={`Eliminar lead ${l.nombre ?? l.telefono}`}
                        tooltip="Eliminar lead (borra la conversación)"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((l) => (
              <li key={l.id} className={`card relative ${newIds.has(l.id) ? "row-new" : ""}`}>
                <button
                  onClick={() => onOpen(l.id)}
                  className="block w-full p-3.5 text-left"
                  aria-label={`Abrir conversación de ${l.nombre ?? l.telefono}`}
                >
                  <div className="flex items-center justify-between gap-2 pr-10">
                    <span className="font-bold">{l.nombre ?? "Sin nombre"}</span>
                    <TempBadge value={l.temperatura} />
                  </div>
                  <LeadMeta lead={l} />
                  {l.atendido_por && (
                    <p className="mt-1 text-xs text-(--ink-2)">
                      {l.atendido_por === "Revisado" ? "Revisado" : <>Atendido por <strong>{l.atendido_por}</strong></>}
                    </p>
                  )}
                  {l.requiere_humano && (
                    <span className="badge badge-hot mt-2"><Flame size={12} aria-hidden="true" /> Necesita asesor</span>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setConfirm(l)}
                  className="absolute right-2 top-2"
                  aria-label={`Eliminar lead ${l.nombre ?? l.telefono}`}
                  tooltip="Eliminar lead (borra la conversación)"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginación">
              <Button
                variant="solid"
                size="sm"
                disabled={page <= 1}
                tooltip="Ir a la página anterior"
                onClick={() => onFilters({ ...filters, page: page - 1 })}
              >
                Anterior
              </Button>
              <span className="tnum text-(--ink-2)">Página {page} de {pages}</span>
              <Button
                variant="solid"
                size="sm"
                disabled={page >= pages}
                tooltip="Ir a la página siguiente"
                onClick={() => onFilters({ ...filters, page: page + 1 })}
              >
                Siguiente
              </Button>
            </nav>
          )}
        </>
      )}

      {confirm && (
        <ConfirmDialog
          title="Eliminar lead"
          danger
          confirmLabel="Eliminar"
          cancelLabel="Cancelar"
          message={
            <>
              ¿Eliminar a <strong>{confirm.nombre ?? formatPhone(confirm.telefono)}</strong> y toda su conversación?
              Es permanente. Si vuelve a escribir, el bot lo trata como primer contacto.
            </>
          }
          onConfirm={() => {
            const id = confirm.id;
            setConfirm(null);
            onDelete(id);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
