"use client";
import { ChartCard, HorizontalBars, StackedColumns, type Series } from "@/components/charts";

const SOURCES: Series[] = [
  { key: "linkedin", label: "LinkedIn", color: "var(--viz-1)" },
  { key: "naukri", label: "Naukri", color: "var(--viz-2)" },
  { key: "other", label: "Other", color: "var(--viz-3)" },
];

export function OverviewCharts({
  weekly,
  funnel,
}: {
  weekly: { week: string; label: string; linkedin: number; naukri: number; other: number }[];
  funnel: { label: string; value: number }[];
}) {
  const top = funnel[0]?.value || 0;
  return (
    <div className="mt-6 grid gap-4 lg:grid-cols-5">
      <ChartCard
        className="lg:col-span-3"
        title="Applications per week"
        subtitle="Last 12 weeks, by where you applied"
        series={SOURCES}
        table={{
          columns: ["Week of", "LinkedIn", "Naukri", "Other", "Total"],
          rows: weekly.map((w) => [w.label, w.linkedin, w.naukri, w.other, w.linkedin + w.naukri + w.other]),
        }}
      >
        <StackedColumns data={weekly} xKey="label" series={SOURCES} />
      </ChartCard>
      <ChartCard
        className="lg:col-span-2"
        title="Funnel"
        subtitle="How far your applications got"
        table={{
          columns: ["Stage", "Applications", "Of applied"],
          rows: funnel.map((f) => [f.label, f.value, top ? `${Math.round((f.value / top) * 100)}%` : "—"]),
        }}
      >
        <HorizontalBars
          data={funnel}
          valueLabel="Applications"
          formatValue={(v) => (top && v !== top ? `${v} · ${Math.round((v / top) * 100)}%` : String(v))}
        />
      </ChartCard>
    </div>
  );
}
