"use client";
import { ChartCard, Columns, HorizontalBars, TrendLines, type Series } from "@/components/charts";
import { weekLabel } from "@/lib/format";
import type { SkillDemand } from "@/lib/insights";

const TREND_COLORS = ["var(--viz-1)", "var(--viz-2)", "var(--viz-3)", "var(--viz-4)"];

export function InsightCharts({
  topSkills,
  hasCv,
  trend,
  trendSkills,
  roles,
  experience,
}: {
  topSkills: SkillDemand[];
  hasCv: boolean;
  trend: Record<string, string | number>[];
  trendSkills: string[];
  roles: { label: string; value: number }[];
  experience: { label: string; value: number }[];
}) {
  const coverageSeries: Series[] = hasCv
    ? [
        { key: "in", label: "In your CV", color: "var(--viz-1)" },
        { key: "out", label: "Not in your CV", color: "var(--viz-muted)" },
      ]
    : [];
  const trendSeries: Series[] = trendSkills.map((s, i) => ({ key: s, label: s, color: TREND_COLORS[i] }));

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <ChartCard
        className="lg:row-span-2"
        title="Most requested skills"
        subtitle="Number of your saved jobs asking for each skill"
        series={coverageSeries}
        table={{
          columns: ["Skill", "Jobs", "Required in", "Share", ...(hasCv ? ["In your CV"] : [])],
          rows: topSkills.map((s) => [
            s.skill,
            s.jobs,
            s.required,
            `${Math.round(s.share * 100)}%`,
            ...(hasCv ? [s.inCv ? "Yes" : "No"] : []),
          ]),
        }}
      >
        <HorizontalBars
          data={topSkills.map((s) => ({ label: s.skill, value: s.jobs, emphasis: s.inCv }))}
          valueLabel="Jobs"
          emphasisKey={hasCv}
        />
      </ChartCard>

      <ChartCard
        title="Demand over time"
        subtitle="Saved jobs per week mentioning the top skills"
        series={trendSeries}
        table={{
          columns: ["Week of", ...trendSkills],
          rows: trend.map((r) => [weekLabel(String(r.week)), ...trendSkills.map((s) => Number(r[s] ?? 0))]),
        }}
      >
        {trend.length < 2 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Needs at least two weeks of saved jobs.</p>
        ) : (
          <TrendLines data={trend} xKey="week" series={trendSeries} xFormatter={weekLabel} />
        )}
      </ChartCard>

      <ChartCard
        title="Experience asked for"
        subtitle="Minimum years in the job description"
        table={{ columns: ["Years", "Jobs"], rows: experience.map((e) => [e.label, e.value]) }}
      >
        <Columns data={experience} valueLabel="Jobs" />
      </ChartCard>

      <ChartCard
        className="lg:col-span-2"
        title="Role types"
        subtitle="What kind of roles your saved jobs are"
        table={{ columns: ["Role", "Jobs"], rows: roles.map((r) => [r.label, r.value]) }}
      >
        {roles.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Role types appear once job descriptions are read by AI.</p>
        ) : (
          <HorizontalBars data={roles} valueLabel="Jobs" />
        )}
      </ChartCard>
    </div>
  );
}
