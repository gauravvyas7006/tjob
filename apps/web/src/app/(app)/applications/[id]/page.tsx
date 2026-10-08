import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ExternalLink } from "lucide-react";
import { STATUS_LABELS } from "@tjob/shared";
import { applicationEvents, cvVersions, db, emails } from "@/db";
import { getApplication } from "@/lib/applications";
import { getCvVersion } from "@/lib/cv/service";
import { getJob } from "@/lib/jobs";
import { requireUser } from "@/lib/session";
import { formatDate, formatDateTime } from "@/lib/format";
import { CategoryBadge, SourceBadge } from "@/components/badges";
import { Button } from "@/components/ui/button";
import {
  AttachCv,
  DeleteApplication,
  FollowUp,
  JdForm,
  NotesEditor,
  StatusSelect,
  TailorButton,
} from "./client";

export const maxDuration = 120;

export async function generateMetadata(props: PageProps<"/applications/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const app = /^[0-9a-f-]{36}$/i.test(id) ? await getApplication(user.id, id) : null;
  return { title: app ? `${app.company} · ${app.title}` : "Application" };
}

export default async function ApplicationPage(props: PageProps<"/applications/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const app = await getApplication(user.id, id);
  if (!app) notFound();

  const [job, cv, versions, events, mail] = await Promise.all([
    app.jobId ? getJob(user.id, app.jobId) : null,
    app.cvVersionId ? getCvVersion(user.id, app.cvVersionId) : null,
    db
      .select({ id: cvVersions.id, title: cvVersions.title, createdAt: cvVersions.createdAt })
      .from(cvVersions)
      .where(eq(cvVersions.userId, user.id))
      .orderBy(desc(cvVersions.createdAt))
      .limit(50),
    db
      .select()
      .from(applicationEvents)
      .where(eq(applicationEvents.applicationId, app.id))
      .orderBy(asc(applicationEvents.createdAt)),
    db
      .select()
      .from(emails)
      .where(and(eq(emails.userId, user.id), eq(emails.applicationId, app.id)))
      .orderBy(asc(emails.receivedAt)),
  ]);
  const ex = job?.extracted ?? null;

  type Item = { at: Date; kind: "event" | "email"; node: React.ReactNode; key: string };
  const timeline: Item[] = [
    ...events
      .filter((e) => e.type !== "email" || !e.emailId)
      .map((e) => ({
        at: e.createdAt,
        kind: "event" as const,
        key: e.id,
        node: (
          <span>
            {e.type === "status_change" && e.toStatus ? (
              <strong className="font-medium">{STATUS_LABELS[e.toStatus]}</strong>
            ) : null}{" "}
            <span className="text-muted-foreground">{e.detail}</span>
          </span>
        ),
      })),
    ...mail.map((m) => ({
      at: m.receivedAt,
      kind: "email" as const,
      key: m.id,
      node: (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {m.direction === "out" ? (
              <span className="text-xs text-muted-foreground">You → {m.toAddress}</span>
            ) : (
              <>
                <CategoryBadge category={m.category} />
                <span className="text-xs text-muted-foreground">{m.fromName || m.fromAddress}</span>
              </>
            )}
          </div>
          <div className="mt-0.5 font-medium">{m.subject}</div>
          {m.summary && <div className="text-sm text-muted-foreground">{m.summary}</div>}
        </div>
      ),
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/applications" className="text-sm text-muted-foreground hover:underline">
            ← Applications
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{app.company || "Unknown company"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="text-foreground">{app.title || "Role not known yet"}</span>
            {app.location && <span>{app.location}</span>}
            <SourceBadge source={app.source} />
            <span>Applied {formatDate(app.appliedAt)}</span>
            {app.jobUrl && (
              <a href={app.jobUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:underline">
                Job posting <ExternalLink className="size-3" />
              </a>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusSelect appId={app.id} status={app.status} />
          <FollowUp appId={app.id} hasCv={Boolean(cv)} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="grid content-start gap-4 lg:col-span-3">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">Job description</h2>
            {ex && (
              <div className="mt-3 grid gap-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                  {ex.roleCategory && <span>{ex.roleCategory}</span>}
                  {ex.seniority !== "unknown" && <span className="capitalize">{ex.seniority}</span>}
                  {ex.minYears >= 0 && (
                    <span>
                      {ex.minYears}
                      {ex.maxYears > ex.minYears ? `–${ex.maxYears}` : "+"} yrs
                    </span>
                  )}
                  {ex.workMode !== "unknown" && <span className="capitalize">{ex.workMode}</span>}
                  {ex.salaryText && <span>{ex.salaryText}</span>}
                </div>
                {ex.requiredSkills.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Required</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.requiredSkills.map((s) => (
                        <span key={s} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {ex.niceToHaveSkills.length > 0 && (
                  <div>
                    <div className="mb-1 text-xs text-muted-foreground">Nice to have</div>
                    <div className="flex flex-wrap gap-1.5">
                      {ex.niceToHaveSkills.map((s) => (
                        <span key={s} className="rounded-md border px-2 py-0.5 text-xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {job?.description ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm text-muted-foreground">Full description</summary>
                <div className="mt-2 max-h-[28rem] overflow-auto text-sm whitespace-pre-wrap">{job.description}</div>
              </details>
            ) : null}
            <JdForm appId={app.id} hasJd={Boolean(job?.description)} />
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">Timeline</h2>
            <ol className="mt-3 grid gap-3">
              {timeline.map((t) => (
                <li key={t.key} className="flex gap-3 text-sm">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{formatDateTime(t.at)}</span>
                  {t.node}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="grid content-start gap-4 lg:col-span-2">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">CV for this job</h2>
            {cv ? (
              <div className="mt-3 grid gap-3 text-sm">
                <div>
                  <Link href={`/cv/${cv.id}`} className="font-medium hover:underline">
                    {cv.title}
                  </Link>
                  <div className="text-muted-foreground">
                    ATS keyword match {cv.atsBefore}% → <strong className="text-foreground">{cv.atsAfter}%</strong> ·{" "}
                    {formatDate(cv.createdAt)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={`/api/cv/${cv.id}/pdf`}>Download PDF</a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/cv/${cv.id}/pdf?inline=1`} target="_blank" rel="noreferrer">
                      Preview
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/cv/${cv.id}`}>Edit</Link>
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No tailored CV attached yet.</p>
            )}
            <div className="mt-4 grid gap-3 border-t pt-4">
              <TailorButton appId={app.id} disabled={!job?.description} />
              <AttachCv appId={app.id} current={app.cvVersionId} versions={versions.map((v) => ({ id: v.id, title: v.title }))} />
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">Notes</h2>
            <NotesEditor appId={app.id} notes={app.notes} />
          </section>

          <div className="flex justify-end">
            <DeleteApplication appId={app.id} />
          </div>
        </div>
      </div>
    </div>
  );
}
