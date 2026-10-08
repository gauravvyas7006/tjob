import { requireUser } from "@/lib/session";
import { marketInsights } from "@/lib/insights";
import { percent } from "@/lib/format";
import { EmptyState, PageHeader, StatTile } from "@/components/page-header";
import { InsightCharts } from "./charts";

export const metadata = { title: "Insights" };

export default async function InsightsPage() {
  const user = await requireUser();
  const data = await marketInsights(user.id);
  const top20 = data.topSkills.slice(0, 20);
  const covered = top20.filter((s) => s.inCv).length;
  const toLearn = data.topSkills.filter((s) => !s.inCv).slice(0, 8);
  const modeTotal = data.workModes.reduce((n, m) => n + m.n, 0);
  const flexible = data.workModes.filter((m) => m.mode !== "onsite").reduce((n, m) => n + m.n, 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Insights"
        description={`What employers ask for, from the ${data.jds} job description${data.jds === 1 ? "" : "s"} you've collected. It reflects the jobs you look at, not the whole market — save more jobs with the extension to sharpen it.`}
      />
      {data.jds === 0 ? (
        <EmptyState title="No job descriptions analysed yet">
          Save jobs with the Chrome extension, paste job descriptions when adding applications, or tailor a CV — each
          job description is read once and counted here.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Job descriptions" value={data.jds} hint={`${data.recentJds} in the last 12 weeks`} />
            <StatTile label="Most requested" value={data.topSkills[0]?.skill ?? "—"} hint={data.topSkills[0] ? `in ${percent(data.topSkills[0].share)} of jobs` : undefined} />
            <StatTile
              label="Your coverage"
              value={data.hasCv ? `${covered}/${top20.length}` : "—"}
              hint={data.hasCv ? "of the top skills are in your CV" : "upload your CV to compare"}
            />
            <StatTile label="Remote or hybrid" value={modeTotal ? percent(flexible / modeTotal) : "—"} hint={modeTotal ? `of ${modeTotal} jobs that say` : "not stated in JDs"} />
          </div>

          <InsightCharts
            topSkills={top20}
            hasCv={data.hasCv}
            trend={data.trend}
            trendSkills={data.trendSkills}
            roles={data.roles.map((r) => ({ label: r.role, value: r.n }))}
            experience={data.experience}
          />

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-medium">Skills to learn next</h2>
              <p className="text-xs text-muted-foreground">In demand in your saved jobs but not in your CV or Extra facts</p>
              {!data.hasCv ? (
                <p className="mt-3 text-sm text-muted-foreground">Upload your CV to see this.</p>
              ) : toLearn.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Your CV covers every frequently requested skill.</p>
              ) : (
                <ol className="mt-3 grid gap-2 text-sm">
                  {toLearn.map((s, i) => (
                    <li key={s.skill} className="flex items-baseline gap-3">
                      <span className="w-4 text-right text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                      <span className="font-medium">{s.skill}</span>
                      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                        {s.jobs} jobs · {percent(s.share)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Already know one of these? Add a true detail to Extra facts on the CV page so tailoring can use it.
              </p>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-medium">Salary by role</h2>
              <p className="text-xs text-muted-foreground">Annual CTC in lakhs (LPA), only from JDs that state it</p>
              {data.salary.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">None of your saved JDs mention salary yet.</p>
              ) : (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="py-1.5 font-medium">Role</th>
                      <th className="py-1.5 text-right font-medium">Jobs</th>
                      <th className="py-1.5 text-right font-medium">Min</th>
                      <th className="py-1.5 text-right font-medium">Median</th>
                      <th className="py-1.5 text-right font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.salary.map((s) => (
                      <tr key={s.role} className="border-b last:border-0">
                        <td className="py-1.5">{s.role}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.n}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.min != null ? s.min.toFixed(1) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.median != null ? s.median.toFixed(1) : "—"}</td>
                        <td className="py-1.5 text-right tabular-nums">{s.max != null ? s.max.toFixed(1) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
