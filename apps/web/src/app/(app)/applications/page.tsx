import Link from "next/link";
import { and, desc, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import {
  APPLICATION_STATUSES,
  JOB_SOURCES,
  STATUS_LABELS,
  type ApplicationStatus,
  type JobSource,
} from "@tjob/shared";
import { applications, cvVersions, db, jobs } from "@/db";
import { requireUser } from "@/lib/session";
import { formatDate, timeAgo } from "@/lib/format";
import { SourceBadge, StatusBadge, sourceLabel } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata = { title: "Applications" };

const BOARD: { title: string; statuses: ApplicationStatus[] }[] = [
  { title: "Saved", statuses: ["saved", "cv_ready"] },
  { title: "Applied", statuses: ["applied"] },
  { title: "Viewed", statuses: ["viewed"] },
  { title: "Assessment", statuses: ["assessment"] },
  { title: "Interview", statuses: ["interview"] },
  { title: "Offer", statuses: ["offer"] },
  { title: "Closed", statuses: ["rejected", "ghosted", "withdrawn"] },
];

export default async function ApplicationsPage(props: PageProps<"/applications">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = APPLICATION_STATUSES.includes(sp.status as ApplicationStatus) ? (sp.status as ApplicationStatus) : null;
  const source = JOB_SOURCES.includes(sp.source as JobSource) ? (sp.source as JobSource) : null;
  const view = sp.view === "board" ? "board" : sp.view === "leads" ? "leads" : "table";

  const where: SQL[] = [eq(applications.userId, user.id)];
  if (status) where.push(eq(applications.status, status));
  if (source) where.push(eq(applications.source, source));
  if (q) where.push(or(ilike(applications.company, `%${q}%`), ilike(applications.title, `%${q}%`))!);

  const rows = await db
    .select({
      id: applications.id,
      company: applications.company,
      title: applications.title,
      location: applications.location,
      source: applications.source,
      status: applications.status,
      appliedAt: applications.appliedAt,
      lastActivityAt: applications.lastActivityAt,
      captureMethod: applications.captureMethod,
      cvVersionId: applications.cvVersionId,
      atsAfter: cvVersions.atsAfter,
    })
    .from(applications)
    .leftJoin(cvVersions, eq(cvVersions.id, applications.cvVersionId))
    .where(and(...where))
    .orderBy(desc(applications.lastActivityAt))
    .limit(500);

  // Leads: jobs from LinkedIn/Naukri job-alert emails that you haven't saved or applied to.
  const leads =
    view === "leads"
      ? await db
          .select({
            id: jobs.id,
            title: jobs.title,
            company: jobs.company,
            source: jobs.source,
            url: jobs.url,
            createdAt: jobs.createdAt,
          })
          .from(jobs)
          .leftJoin(applications, eq(applications.jobId, jobs.id))
          .where(
            and(
              eq(jobs.userId, user.id),
              eq(jobs.capturedVia, "email"),
              isNull(applications.id),
              ...(q ? [or(ilike(jobs.company, `%${q}%`), ilike(jobs.title, `%${q}%`))!] : []),
            ),
          )
          .orderBy(desc(jobs.createdAt))
          .limit(200)
      : [];

  const qs = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const merged = { q: q || null, status, source, view, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v && !(k === "view" && v === "table")) p.set(k, v);
    const s = p.toString();
    return s ? `/applications?${s}` : "/applications";
  };

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Applications"
        description={`${rows.length} shown`}
        actions={
          <>
            <div className="flex rounded-md border p-0.5 text-sm">
              {(["table", "board", "leads"] as const).map((v) => (
                <Link
                  key={v}
                  href={qs({ view: v })}
                  className={cn("rounded px-3 py-1 capitalize", view === v ? "bg-accent" : "text-muted-foreground")}
                >
                  {v}
                </Link>
              ))}
            </div>
            <Button asChild>
              <Link href="/applications/new">Add application</Link>
            </Button>
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/applications">
        <Input name="q" defaultValue={q} placeholder="Search company or role" className="w-56" />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {APPLICATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          name="source"
          defaultValue={source ?? ""}
          className="h-9 rounded-md border bg-background px-2 text-sm"
          aria-label="Source"
        >
          <option value="">All sources</option>
          {JOB_SOURCES.map((s) => (
            <option key={s} value={s}>
              {sourceLabel(s)}
            </option>
          ))}
        </select>
        {view === "board" && <input type="hidden" name="view" value="board" />}
        <Button type="submit" variant="outline" size="sm">
          Filter
        </Button>
        {(q || status || source) && (
          <Link href={qs({ q: null, status: null, source: null })} className="text-sm text-muted-foreground underline">
            Clear
          </Link>
        )}
      </form>

      {view === "leads" ? (
        leads.length === 0 ? (
          <EmptyState title="No leads yet">
            Jobs listed in your LinkedIn and Naukri job-alert emails appear here once your mailbox is connected.
          </EmptyState>
        ) : (
          <div className="rounded-xl border bg-card">
            <p className="border-b px-4 py-3 text-sm text-muted-foreground">
              From your job-alert emails. Open one: the tjob extension shows your match score and lets you save it or
              tailor your CV.
            </p>
            <ul className="divide-y">
              {leads.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{l.title}</div>
                    <div className="text-xs text-muted-foreground">{l.company || "Company not shown"}</div>
                  </div>
                  <SourceBadge source={l.source} />
                  <span className="text-xs text-muted-foreground">{timeAgo(l.createdAt)}</span>
                  {l.url && (
                    <Button asChild size="sm" variant="outline">
                      <a href={l.url} target="_blank" rel="noreferrer">
                        Open job
                      </a>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      ) : rows.length === 0 ? (
        <EmptyState title="No applications yet">
          Save jobs with the Chrome extension, add one manually, import your LinkedIn history in Settings, or connect
          your mailbox so confirmations are picked up automatically.
        </EmptyState>
      ) : view === "table" ? (
        <div className="rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company / role</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied</TableHead>
                <TableHead>Last activity</TableHead>
                <TableHead className="text-right">CV</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-xs">
                    <Link href={`/applications/${r.id}`} className="font-medium hover:underline">
                      {r.company || "Unknown company"}
                    </Link>
                    <div className="truncate text-xs text-muted-foreground">
                      {r.title}
                      {r.location ? ` · ${r.location}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <SourceBadge source={r.source} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDate(r.appliedAt)}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap text-muted-foreground">{timeAgo(r.lastActivityAt)}</TableCell>
                  <TableCell className="text-right text-sm">
                    {r.cvVersionId ? (
                      <Link href={`/cv/${r.cvVersionId}`} className="hover:underline">
                        Tailored{r.atsAfter != null ? ` · ${r.atsAfter}%` : ""}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {BOARD.map((col) => {
            const items = rows.filter((r) => col.statuses.includes(r.status));
            return (
              <section key={col.title} className="w-64 shrink-0 rounded-xl border bg-muted/30 p-2">
                <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
                  {col.title}
                  <span className="text-xs text-muted-foreground">{items.length}</span>
                </h2>
                <ul className="grid gap-2">
                  {items.map((r) => (
                    <li key={r.id}>
                      <Link
                        href={`/applications/${r.id}`}
                        className="block rounded-lg border bg-card p-2.5 text-sm hover:border-primary/40"
                      >
                        <div className="font-medium">{r.company || "Unknown company"}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.title}</div>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <SourceBadge source={r.source} />
                          {col.statuses.length > 1 ? (
                            <StatusBadge status={r.status} />
                          ) : (
                            <span className="text-xs text-muted-foreground">{timeAgo(r.lastActivityAt)}</span>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
