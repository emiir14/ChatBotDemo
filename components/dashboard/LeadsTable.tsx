"use client";

import { useState, type FormEvent, type JSX } from "react";
import { Flame, Search } from "lucide-react";
import { TempBadge } from "./ui";
import { formatPhone, timeAgo } from "@/lib/format";
import type { LeadRow, LeadEstado, Temperatura } from "./types";

export interface LeadFilters {
  temperatura: "all" | Temperatura;
  estado: "all" | LeadEstado;
  q: string;
  page: number;
}

function LeadMeta({ lead }: { lead: LeadRow }): JSX.Element {
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8rem] text-(--ink-2)">
      <span className="tnum">{formatPhone(lead.telefono)}</span>
      {lead.auto_interes && <span className="font-semibold text-(--ink)">{lead.auto_interes}</span>}
      {lead.presupuesto && <span className="tnum">{lead.presupuesto}</span>}
      {lead.permuta && <span>Permuta</span>}
      <span>{timeAgo(lead.last_customer_message_at ?? lead.created_at)}</span>
    </div>
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
  newIds,
}: {
  items: LeadRow[];
  total: number;
  page: number;
  pageSize: number;
  filters: LeadFilters;
  onFilters: (f: LeadFilters) => void;
  onOpen: (id: string) => void;
  newIds: Set<string>;
}): JSX.Element {
  const [q, setQ] = useState(filters.q);
  const pages = Math.max(1, Math.ceil(total / pageSize));

  function submitSearch(e: FormEvent): void {
    e.preventDefault();
    onFilters({ ...filters, q, page: 1 });
  }

  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <form onSubmit={submitSearch} role="search" className="relative flex-1">
          <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ink-3)" />
          <input
            className="input pl-9"
            placeholder="Buscar por nombre o teléfono…"
            title="Buscar por nombre o teléfono"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar por nombre o teléfono"
          />
        </form>
        <div className="flex gap-2">
          <select
            className="select"
            value={filters.temperatura}
            title="Filtrar por temperatura del lead"
            onChange={(e) => onFilters({ ...filters, temperatura: e.target.value as LeadFilters["temperatura"], page: 1 })}
            aria-label="Filtrar por temperatura"
          >
            <option value="all">Todas</option>
            <option value="caliente">Calientes</option>
            <option value="tibio">Tibios</option>
            <option value="frio">Fríos</option>
          </select>
          <select
            className="select"
            value={filters.estado}
            title="Filtrar por etapa del lead"
            onChange={(e) => onFilters({ ...filters, estado: e.target.value as LeadFilters["estado"], page: 1 })}
            aria-label="Filtrar por estado"
          >
            <option value="all">Todos</option>
            <option value="nuevo">Nuevos</option>
            <option value="en_conversacion">En conversación</option>
            <option value="derivado">Derivados</option>
            <option value="recontactado">Recontactados</option>
          </select>
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
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Nombre y teléfono del contacto">Lead</th>
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Modelo que le interesa y su presupuesto">Interés</th>
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Temperatura: qué tan cerca está de comprar (caliente, tibio o frío)">Temperatura</th>
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Si pidió hablar con una persona o el bot lo derivó a un asesor">Asesor</th>
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Quién lo atendió (se carga al marcar como atendido)">Atendido por</th>
                  <th scope="col" className="px-3 py-2.5 font-bold" title="Cuándo fue su último mensaje">Actividad</th>
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
                    </td>
                    <td className="px-3 py-2.5">
                      {l.auto_interes ?? <span className="text-(--ink-3)">—</span>}
                      {l.presupuesto && <div className="tnum text-xs text-(--ink-2)">{l.presupuesto}</div>}
                    </td>
                    <td className="px-3 py-2.5"><TempBadge value={l.temperatura} /></td>
                    <td className="px-3 py-2.5">
                      {l.requiere_humano ? (
                        <span className="badge badge-hot" title="Pidió un asesor humano">
                          <Flame size={12} aria-hidden="true" /> Asesor
                        </span>
                      ) : (
                        <span className="text-(--ink-3)">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-sm">
                      {l.atendido_por ?? <span className="text-(--ink-3)">—</span>}
                    </td>
                    <td className="tnum px-3 py-2.5 text-xs text-(--ink-2)">
                      {timeAgo(l.last_customer_message_at ?? l.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas */}
          <ul className="flex flex-col gap-2 md:hidden">
            {items.map((l) => (
              <li key={l.id}>
                <button
                  onClick={() => onOpen(l.id)}
                  className={`card w-full p-3.5 text-left ${newIds.has(l.id) ? "row-new" : ""}`}
                  aria-label={`Abrir conversación de ${l.nombre ?? l.telefono}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold">{l.nombre ?? "Sin nombre"}</span>
                    <TempBadge value={l.temperatura} />
                  </div>
                  <LeadMeta lead={l} />
                  {l.atendido_por && (
                    <p className="mt-1 text-xs text-(--ink-2)">Atendido por <strong>{l.atendido_por}</strong></p>
                  )}
                  {l.requiere_humano && (
                    <span className="badge badge-hot mt-2"><Flame size={12} aria-hidden="true" /> Necesita asesor</span>
                  )}
                </button>
              </li>
            ))}
          </ul>

          {pages > 1 && (
            <nav className="mt-3 flex items-center justify-between text-sm" aria-label="Paginación">
              <button
                className="btn btn-solid btn-sm"
                disabled={page <= 1}
                title="Ir a la página anterior"
                onClick={() => onFilters({ ...filters, page: page - 1 })}
              >
                Anterior
              </button>
              <span className="tnum text-(--ink-2)">Página {page} de {pages}</span>
              <button
                className="btn btn-solid btn-sm"
                disabled={page >= pages}
                title="Ir a la página siguiente"
                onClick={() => onFilters({ ...filters, page: page + 1 })}
              >
                Siguiente
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
