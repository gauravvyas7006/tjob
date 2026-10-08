"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/utils";

/*
 * Chart conventions (dataviz skill): categorical slots in fixed order (--viz-1..), thin marks
 * (bars <= 24px, 4px rounded data-end, 2px lines), hairline recessive grid, a legend for >= 2
 * series, text in ink tokens (never series colors), hover tooltip, and a table view for every
 * chart (required relief for the light-mode slots under 3:1 contrast).
 */

const AXIS = { fill: "var(--viz-axis)", fontSize: 12 };
const GRID = "var(--viz-grid)";

export interface Series {
  key: string;
  label: string;
  color: string;
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

interface TooltipBoxProps {
  active?: boolean;
  payload?: readonly { dataKey?: unknown; name?: unknown; value?: unknown; color?: string }[];
  label?: unknown;
  fmtLabel?: (l: string) => string;
}

function TooltipBox({ active, payload, label, fmtLabel }: TooltipBoxProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <div className="mb-1 font-medium">{fmtLabel ? fmtLabel(String(label)) : String(label)}</div>
      {payload.map((p) => (
        <div key={String(p.dataKey)} className="flex items-center gap-2">
          <span className="size-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span className="text-muted-foreground">{String(p.name)}</span>
          <span className="ml-auto pl-3 tabular-nums font-medium">{String(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  series = [],
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  series?: Series[];
  table: { columns: string[]; rows: (string | number)[][] };
  children: React.ReactNode;
  className?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex rounded-md border p-0.5 text-xs" role="tablist" aria-label={`${title} view`}>
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-2 py-0.5 capitalize",
                view === v ? "bg-accent text-accent-foreground" : "text-muted-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      {view === "chart" ? (
        <>
          <Legend series={series} />
          <div className="mt-2">{children}</div>
        </>
      ) : (
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                {table.columns.map((c, i) => (
                  <th key={c} className={cn("py-1.5 font-medium", i > 0 && "text-right")}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  {r.map((cell, j) => (
                    <td key={j} className={cn("py-1.5", j > 0 && "text-right tabular-nums")}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Stacked columns over time (e.g. applications per week by source). */
export function StackedColumns({
  data,
  xKey,
  series,
  xFormatter,
  height = 240,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  xFormatter?: (v: string) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xFormatter} minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} fmtLabel={xFormatter} />}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            fill={s.color}
            maxBarSize={24}
            stroke="var(--card)"
            strokeWidth={2}
            // Round only the data-end: the top-most non-zero segment of each column.
            shape={(props: React.ComponentProps<typeof Rectangle> & { payload?: Record<string, unknown> }) => {
              const isTop = series.slice(i + 1).every((later) => !Number(props.payload?.[later.key] ?? 0));
              return <Rectangle {...props} radius={isTop ? [4, 4, 0, 0] : 0} />;
            }}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Horizontal bars, one hue. With `emphasisKey`, bars where the flag is true use the accent and
 * the rest the de-emphasis gray (emphasis form, e.g. "skills in your CV" vs not).
 */
export function HorizontalBars({
  data,
  valueLabel,
  emphasisKey,
  formatValue = (v) => String(v),
  color = "var(--viz-1)",
}: {
  data: { label: string; value: number; emphasis?: boolean }[];
  valueLabel: string;
  emphasisKey?: boolean;
  formatValue?: (v: number) => string;
  color?: string;
}) {
  const height = Math.max(120, data.length * 30 + 20);
  const rows = data.map((d) => ({
    ...d,
    fill: emphasisKey ? (d.emphasis ? color : "var(--viz-muted)") : color,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke={GRID} />
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ ...AXIS, fill: "var(--foreground)" }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          width={140}
          interval={0}
        />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} />}
        />
        <Bar dataKey="value" name={valueLabel} maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          <LabelList
            dataKey="value"
            position="right"
            className="fill-muted-foreground text-xs tabular-nums"
            formatter={(v) => formatValue(Number(v ?? 0))}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Single-series columns over ordered categories (e.g. experience buckets). */
export function Columns({
  data,
  valueLabel,
  height = 220,
}: {
  data: { label: string; value: number }[];
  valueLabel: string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 20, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} />}
        />
        <Bar dataKey="value" name={valueLabel} fill="var(--viz-1)" maxBarSize={24} radius={[4, 4, 0, 0]}>
          <LabelList dataKey="value" position="top" className="fill-muted-foreground text-xs tabular-nums" />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Multi-line trend (<= 4 series keeps every pair distinguishable). */
export function TrendLines({
  data,
  xKey,
  series,
  xFormatter,
  height = 240,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  xFormatter?: (v: string) => string;
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={xFormatter} minTickGap={12} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ stroke: "var(--viz-axis)", strokeWidth: 1 }}
          content={(p) => <TooltipBox active={p.active} payload={p.payload} label={p.label} fmtLabel={xFormatter} />}
        />
        {series.map((s) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
            type="linear"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
