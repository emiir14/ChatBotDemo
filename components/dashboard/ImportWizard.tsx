"use client";

import { useRef, useState, type JSX } from "react";
import { Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { TEMPLATE_COLUMNS } from "@/lib/stock-import";

interface PreviewData {
  nuevos: Array<{ fila: number; data: { codigo: string; marca: string; modelo: string; precio: number; moneda: string } }>;
  modificados: Array<{ fila: number; codigo: string; cambios: string[] }>;
  ausentes: Array<{ codigo: string; marca: string; modelo: string; version: string }>;
  errores: Array<{ fila: number; codigo: string; errores: string[] }>;
  duplicadosEnArchivo: string[];
  rows: unknown[];
}

/** Asistente de importación: plantilla → archivo → vista previa → aplicar. */
export function ImportWizard({ onApplied }: { onApplied: () => void }): JSX.Element {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"update" | "replace">("update");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [markSold, setMarkSold] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function upload(): Promise<void> {
    if (!file) return;
    setLoading(true);
    setError(null);
    setDone(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/dashboard/stock/import", { method: "POST", body: form });
      const data = (await res.json()) as PreviewData & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "No se pudo procesar");
      setPreview(data);
      setMarkSold([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar el archivo");
    } finally {
      setLoading(false);
    }
  }

  async function apply(): Promise<void> {
    if (!preview) return;
    if (preview.errores.length > 0) {
      setError("Corregí los errores del archivo antes de aplicar.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/stock/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: "apply", mode, rows: preview.rows, markSold }),
      });
      const data = (await res.json()) as { ok?: boolean; altas?: number; modificados?: number; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "No se pudo aplicar");
      setDone(
        mode === "replace"
          ? `Base reemplazada: ${data.altas} vehículos.`
          : `Listo: ${data.altas} altas, ${data.modificados} modificados${markSold.length > 0 ? `, ${markSold.length} marcados vendidos` : ""}.`,
      );
      setPreview(null);
      setFile(null);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al aplicar");
    } finally {
      setLoading(false);
    }
  }

  function toggleMarkSold(codigo: string): void {
    setMarkSold((s) => (s.includes(codigo) ? s.filter((c) => c !== codigo) : [...s, codigo]));
  }

  return (
    <section aria-label="Carga por Excel o CSV" className="card p-4">
      <h2 className="text-base font-bold">Carga por Excel / CSV</h2>
      <p className="mt-0.5 text-sm text-(--ink-2)">
        Subí un archivo <strong>.csv o .xlsx</strong> con el formato esperado. Vas a ver una vista previa antes de aplicar.
      </p>

      <div className="mt-3 flex flex-col gap-2.5">
        <ButtonLink variant="ghost" size="sm" className="w-fit" href="/api/dashboard/stock/template" download tooltip="Bajá un CSV de ejemplo con el formato correcto">
          <Download size={14} aria-hidden="true" /> Descargar ejemplo CSV
        </ButtonLink>
        <details className="rounded-xl bg-(--surface-3) px-3 py-2.5 text-sm">
          <summary className="cursor-pointer font-bold">Ver formato esperado del archivo</summary>
          <p className="mt-1.5 text-(--ink-2)">
            Primera fila = encabezado con estas columnas (<strong>codigo, marca, modelo y precio</strong> obligatorias):
          </p>
          <p className="tnum mt-1 break-words text-[0.8rem]">{TEMPLATE_COLUMNS.join(" · ")}</p>
          <p className="mt-1.5 text-(--ink-2)">
            Ejemplo: <code className="tnum text-[0.8rem]">STK-001,,Toyota,Hilux,DX 2.4 TD 4x2 MT,2025,0,41200,USD,Diesel,Manual,Blanco,disponible,no,Pick-up cabina doble</code>
          </p>
          <p className="mt-1 text-(--ink-2)">Reglas: precio mayor a 0 · año 1990 a actual+1 · moneda ARS o USD · estado disponible, reservado o vendido · es_0km sí/no · en color podés poner varios colores separados por coma (ej: Blanco, Negro; entre comillas si el separador es la coma). Cada auto se identifica por su <strong>codigo</strong>: si ya existe se actualiza, si no se crea.</p>
        </details>

        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Qué hacer con el archivo">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="mode" checked={mode === "update"} onChange={() => setMode("update")} className="h-5 w-5 accent-(--accent)" />
            <span><strong>Solo actualizar:</strong> agrega nuevos y modifica existentes. Lo ausente se lista, sin cambios automáticos.</span>
          </label>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
            <input type="radio" name="mode" checked={mode === "replace"} onChange={() => setMode("replace")} className="h-5 w-5 accent-(--accent)" />
            <span><strong>Reemplazar todo:</strong> borra el stock actual y lo reemplaza por el archivo.</span>
          </label>
        </div>

        <div
          role="button"
          tabIndex={0}
          aria-label="Subir archivo de stock (.csv o .xlsx, máximo 2 MB)"
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const f = e.dataTransfer.files?.[0];
            if (f) {
              setFile(f);
              setPreview(null);
              setError(null);
            }
          }}
          className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
            dragging ? "border-(--accent) bg-(--accent-soft)" : "border-(--line) bg-(--surface)"
          }`}
        >
          <FileSpreadsheet size={28} className="text-(--ink-2)" aria-hidden="true" />
          <p className="text-sm font-bold">
            {dragging ? "Soltá el archivo acá" : "Arrastrá tu archivo acá o tocá para buscarlo"}
          </p>
          <p className="text-xs text-(--ink-2)">.csv o .xlsx · máximo 2 MB</p>
          <span className={buttonClass({ variant: "ghost", size: "sm", className: "mt-1" })}>Elegir archivo</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            tabIndex={-1}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setPreview(null);
              setError(null);
            }}
          />
        </div>

        {file && (
          <div className="flex items-center gap-2 rounded-xl bg-(--surface-3) px-3 py-2 text-sm">
            <FileSpreadsheet size={16} aria-hidden="true" className="shrink-0 text-(--ink-2)" />
            <span className="min-w-0 flex-1 truncate font-semibold">{file.name}</span>
            <span className="tnum shrink-0 text-xs text-(--ink-2)">
              {(file.size / 1024).toFixed(0)} KB
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => {
                setFile(null);
                setPreview(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
              aria-label={`Quitar ${file.name}`}
              tooltip="Quitar el archivo elegido"
            >
              <X size={14} aria-hidden="true" />
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            className="sm:w-auto"
            onClick={upload}
            disabled={!file || loading}
            tooltip="Ver qué cambios haría este archivo, sin aplicar"
          >
            <Upload size={15} aria-hidden="true" />
            {loading ? "Procesando…" : "Vista previa"}
          </Button>
        </div>
        {error && <p role="alert" className="text-sm font-semibold text-(--danger)">{error}</p>}
        {done && <p role="status" className="text-sm font-semibold text-(--ok)">{done}</p>}
      </div>

      {preview && (
        <div className="mt-4 border-t border-(--line) pt-3">
          <h3 className="font-bold">Vista previa (sin aplicar todavía)</h3>
          {mode === "replace" && (
            <p role="alert" className="mt-2 text-sm font-semibold text-(--danger)">
              Atención: al aplicar se BORRA todo el stock actual y se reemplaza por estas {preview.rows.length} filas.
            </p>
          )}

          {preview.errores.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-bold text-(--danger)">Errores ({preview.errores.length}) — corregilos en el archivo:</p>
              <ul className="mt-1 flex max-h-40 flex-col gap-1 overflow-y-auto text-[0.83rem]">
                {preview.errores.map((e, i) => (
                  <li key={i} className="rounded bg-(--surface-3) px-2 py-1">
                    Fila {e.fila}{e.codigo ? ` (${e.codigo})` : ""}: {e.errores.join("; ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {preview.duplicadosEnArchivo.length > 0 && (
            <p className="mt-2 text-sm font-semibold text-(--warm)">
              Códigos duplicados en el archivo (se usa la primera aparición): {preview.duplicadosEnArchivo.join(", ")}
            </p>
          )}

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-sm font-bold text-(--ok)">Nuevos ({preview.nuevos.length})</p>
              <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto text-[0.83rem]">
                {preview.nuevos.map((n) => (
                  <li key={n.data.codigo} className="rounded bg-(--surface-3) px-2 py-1">
                    <strong>{n.data.codigo}</strong> {n.data.marca} {n.data.modelo}
                  </li>
                ))}
                {preview.nuevos.length === 0 && <li className="text-(--ink-3)">Ninguno</li>}
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold">Modificados ({preview.modificados.length})</p>
              <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto text-[0.83rem]">
                {preview.modificados.map((m) => (
                  <li key={m.codigo} className="rounded bg-(--surface-3) px-2 py-1">
                    <strong>{m.codigo}</strong>: {m.cambios.join(", ")}
                  </li>
                ))}
                {preview.modificados.length === 0 && <li className="text-(--ink-3)">Ninguno</li>}
              </ul>
            </div>
            <div>
              <p className="text-sm font-bold text-(--warm)">Ausentes en el archivo ({preview.ausentes.length})</p>
              <p className="text-xs text-(--ink-2)">No se tocan salvo que los marques:</p>
              <ul className="mt-1 flex max-h-48 flex-col gap-1 overflow-y-auto text-[0.83rem]">
                {preview.ausentes.map((a) => (
                  <li key={a.codigo}>
                    <label className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded bg-(--surface-3) px-2 py-1">
                      <input
                        type="checkbox"
                        checked={markSold.includes(a.codigo)}
                        onChange={() => toggleMarkSold(a.codigo)}
                        className="h-4 w-4 accent-(--accent)"
                        disabled={mode === "replace"}
                      />
                      <span><strong>{a.codigo}</strong> {a.marca} {a.modelo} <em>(marcar vendido)</em></span>
                    </label>
                  </li>
                ))}
                {preview.ausentes.length === 0 && <li className="text-(--ink-3)">Ninguno</li>}
              </ul>
            </div>
          </div>

          <Button
            variant="primary"
            block
            className="mt-3 sm:w-auto"
            onClick={apply}
            disabled={loading}
            tooltip="Aplicar los cambios del archivo al stock"
          >
            {loading ? "Aplicando…" : mode === "replace" ? "Reemplazar toda la base" : `Aplicar (${preview.nuevos.length + preview.modificados.length} cambios)`}
          </Button>
        </div>
      )}
    </section>
  );
}
