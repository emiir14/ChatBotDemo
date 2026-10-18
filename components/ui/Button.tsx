"use client";

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, JSX, Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Botón canónico del panel. Única fuente de verdad de estilos: compone las
 * clases `.btn` de globals.css. Evita que cada botón tenga su propio código.
 *
 * Variantes: primary (acción principal) · solid (secundaria visible) ·
 *            ghost (terciaria, con borde) · danger (destructiva).
 * Tamaños: md (44px) · sm (36px) · xs (30px) · icon (44²) · icon-sm (36²).
 * Tooltip: pasá `tooltip` y se muestra al pasar/enfocar. En barras superiores
 * usá `tooltipSide="bottom"` para que no se salga por arriba.
 */

export type ButtonVariant = "primary" | "solid" | "ghost" | "danger";
export type ButtonSize = "md" | "sm" | "xs" | "icon" | "icon-sm";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  solid: "btn-solid",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: "",
  sm: "btn-sm",
  xs: "btn-xs",
  icon: "btn-icon",
  "icon-sm": "btn-icon-sm",
};

export interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ocupa todo el ancho disponible. */
  block?: boolean;
  /** Texto del tooltip que aparece al pasar o enfocar. */
  tooltip?: string;
  /** Lado donde aparece el tooltip (default: arriba). */
  tooltipSide?: "top" | "bottom";
  className?: string;
}

/** Clases `.btn` para elementos que no son <button> ni <a>. */
export function buttonClass(props: ButtonStyleProps = {}): string {
  const { variant = "solid", size = "md", block = false, className } = props;
  return cn("btn", VARIANT_CLASS[variant], SIZE_CLASS[size], block && "w-full", className);
}

export interface ButtonProps
  extends ButtonStyleProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonStyleProps> {
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "solid",
  size = "md",
  block = false,
  tooltip,
  tooltipSide,
  type = "button",
  className,
  ref,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      ref={ref}
      type={type}
      data-tip={tooltip}
      data-tip-pos={tooltip ? (tooltipSide ?? "top") : undefined}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    />
  );
}

export interface ButtonLinkProps
  extends ButtonStyleProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonStyleProps> {
  ref?: Ref<HTMLAnchorElement>;
}

/** Igual que Button pero renderiza un <a> (misma norma y estilos). */
export function ButtonLink({
  variant = "solid",
  size = "md",
  block = false,
  tooltip,
  tooltipSide,
  className,
  ref,
  ...rest
}: ButtonLinkProps): JSX.Element {
  return (
    <a
      ref={ref}
      data-tip={tooltip}
      data-tip-pos={tooltip ? (tooltipSide ?? "top") : undefined}
      className={buttonClass({ variant, size, block, className })}
      {...rest}
    />
  );
}
