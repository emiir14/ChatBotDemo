"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type JSX,
} from "react";
import { createPortal } from "react-dom";

/**
 * Tooltip flotante renderizado en un portal al <body>. A diferencia de un
 * `::after` posicionado dentro del elemento, este NO se recorta por ancestros
 * con `overflow: hidden/auto` (tarjetas, columnas, tablas, drawer) y, si no hay
 * espacio, se voltea (arriba/abajo) y se ajusta para no salirse de la pantalla.
 */

export type TooltipSide = "top" | "bottom";

const GAP = 8;
const EDGE = 8;

/** SSR-safe: en el servidor no hay layout, así que cae a useEffect. */
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface Coords {
  left: number;
  top: number;
}

export interface TooltipApi {
  /** Ref a colocar en el disparador (botón/enlace). */
  ref: (node: HTMLElement | null) => void;
  onShow: () => void;
  onHide: () => void;
  /** Nodo a renderizar (portal); null si no hay tooltip. */
  node: JSX.Element | null;
}

export function useTooltip(label: string | undefined, preferredSide: TooltipSide = "top"): TooltipApi {
  const trigger = useRef<HTMLElement | null>(null);
  const tip = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  const ref = useCallback((node: HTMLElement | null) => {
    trigger.current = node;
  }, []);
  const onShow = useCallback(() => {
    if (label) setOpen(true);
  }, [label]);
  const onHide = useCallback(() => setOpen(false), []);

  const reposition = useCallback(() => {
    const el = trigger.current;
    const tipEl = tip.current;
    if (!el || !tipEl) return;
    const r = el.getBoundingClientRect();
    const t = tipEl.getBoundingClientRect();
    let side = preferredSide;
    const spaceAbove = r.top - GAP - t.height;
    const spaceBelow = window.innerHeight - r.bottom - GAP - t.height;
    if (side === "top" && spaceAbove < EDGE && spaceBelow > spaceAbove) side = "bottom";
    else if (side === "bottom" && spaceBelow < EDGE && spaceAbove > spaceBelow) side = "top";
    const top = side === "top" ? r.top - GAP - t.height : r.bottom + GAP;
    let left = r.left + r.width / 2 - t.width / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - t.width));
    setCoords((cur) => (cur && cur.left === left && cur.top === top ? cur : { left, top }));
  }, [preferredSide]);

  useIsoLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    const onChange = (): void => reposition();
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [open, reposition]);

  const node =
    open && label
      ? createPortal(
          <div
            ref={tip}
            role="tooltip"
            className="tooltip"
            style={{
              left: coords?.left ?? 0,
              top: coords?.top ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
          >
            {label}
          </div>,
          document.body,
        )
      : null;

  return { ref, onShow, onHide, node };
}
