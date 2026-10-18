"use client";

/**
 * Envoltorio de gráficos estilo shadcn/ui, sobre Recharts.
 * Expone ChartContainer + ChartTooltip + ChartLegend y resuelve colores/labels
 * desde un `ChartConfig`. Los colores salen de variables CSS (modo claro/oscuro).
 */

import * as React from "react";
import * as RechartsPrimitive from "recharts";
import { cn } from "@/lib/utils";

export type ChartConfig = {
  [k in string]: {
    label?: React.ReactNode;
    icon?: React.ComponentType;
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<"light" | "dark", string> }
  );
};

type ChartContextProps = { config: ChartConfig };
const ChartContext = React.createContext<ChartContextProps | null>(null);

function useChart(): ChartContextProps {
  const context = React.useContext(ChartContext);
  if (!context) throw new Error("useChart must be used within a <ChartContainer />");
  return context;
}

export function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<typeof RechartsPrimitive.ResponsiveContainer>["children"];
}): React.JSX.Element {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;
  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-(--ink-3)",
          className,
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} />
        <RechartsPrimitive.ResponsiveContainer>{children}</RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartStyle({ id, config }: { id: string; config: ChartConfig }): React.JSX.Element | null {
  const colorConfig = Object.entries(config).filter(([, c]) => c.theme || c.color);
  if (!colorConfig.length) return null;
  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `[data-chart=${id}] {\n${colorConfig
          .map(([key, itemConfig]) => {
            const color = itemConfig.theme
              ? `light-dark(${itemConfig.theme.light}, ${itemConfig.theme.dark})`
              : itemConfig.color;
            return color ? `  --color-${key}: ${color};` : null;
          })
          .filter(Boolean)
          .join("\n")}\n}`,
      }}
    />
  );
}

export const ChartTooltip = RechartsPrimitive.Tooltip;

interface ChartTooltipItem {
  name?: string;
  dataKey?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipContentProps extends React.ComponentProps<"div"> {
  active?: boolean;
  payload?: ChartTooltipItem[];
  label?: unknown;
  hideLabel?: boolean;
  hideIndicator?: boolean;
  indicator?: "line" | "dot" | "dashed";
  nameKey?: string;
  labelKey?: string;
  formatter?: (
    value: unknown,
    name: string,
    item: ChartTooltipItem,
    index: number,
    payload: ChartTooltipItem[],
  ) => React.ReactNode;
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  hideLabel = false,
  hideIndicator = false,
  formatter,
  indicator = "dot",
  nameKey,
  labelKey,
}: ChartTooltipContentProps): React.JSX.Element | null {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  const resolvedLabel =
    labelKey && payload[0]?.payload
      ? (payload[0].payload as Record<string, unknown>)[labelKey]
      : label;

  return (
    <div
      className={cn(
        "grid min-w-[9rem] gap-1.5 rounded-lg border border-(--line) bg-(--surface-2) px-3 py-2 text-xs shadow-xl",
        className,
      )}
    >
      {!hideLabel && resolvedLabel !== undefined && resolvedLabel !== null && resolvedLabel !== "" && (
        <div className="font-bold text-(--ink)">{String(resolvedLabel)}</div>
      )}
      <div className="grid gap-1.5">
        {payload.map((item: ChartTooltipItem, i: number) => {
          const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`;
          const itemConfig = config[key as string];
          const color = itemConfig?.color ?? item.color ?? "var(--chart-1)";
          const seriesLabel = itemConfig?.label ?? item.name ?? key;
          const value = Array.isArray(item.value) ? item.value.join(", ") : String(item.value ?? "");
          const rendered =
            typeof formatter === "function"
              ? formatter(value, item.name ?? key, item, i, payload)
              : value;
          return (
            <div key={`${key}-${i}`} className="flex w-full items-center gap-2">
              {!hideIndicator && (
                <span
                  className={cn("shrink-0 rounded-[2px]", indicator === "dot" ? "size-2.5" : "h-3 w-1")}
                  style={{ background: color }}
                  aria-hidden="true"
                />
              )}
              <span className="flex-1 text-(--ink-2)">{seriesLabel}</span>
              <span className="tnum font-bold text-(--ink)">{String(rendered)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const ChartLegend = RechartsPrimitive.Legend;

export function ChartLegendContent({
  className,
  payload,
  nameKey,
}: React.ComponentProps<"div"> & {
  payload?: Array<{ value?: string; dataKey?: string; color?: string }>;
  nameKey?: string;
}): React.JSX.Element | null {
  const { config } = useChart();
  if (!payload?.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5", className)}>
      {payload.map((item, i) => {
        const key = `${nameKey ?? item.dataKey ?? item.value ?? "value"}`;
        const itemConfig = config[key as string];
        const color = itemConfig?.color ?? item.color ?? "var(--chart-1)";
        return (
          <div key={`${key}-${i}`} className="flex items-center gap-1.5">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
            <span className="text-(--ink-2)">{itemConfig?.label ?? item.value}</span>
          </div>
        );
      })}
    </div>
  );
}
