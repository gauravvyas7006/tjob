import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { applications, db } from "@/db";
import { ensureAtsReport, getCvVersion, getMasterCv } from "@/lib/cv/service";
import { getJob } from "@/lib/jobs";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { AtsReportCard } from "@/components/ats-report";
import { GapHelper } from "@/components/gap-helper";
import { Button } from "@/components/ui/button";
import { DeleteVersion, Retailor, VersionEditor } from "./client";

export const maxDuration = 120;

export async function generateMetadata(props: PageProps<"/cv/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const v = /^[0-9a-f-]{36}$/i.test(id) ? await getCvVersion(user.id, id) : null;
  return { title: v?.title ?? "CV version" };
}

export default async function CvVersionPage(props: PageProps<"/cv/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const v = await getCvVersion(user.id, id);
  if (!v) notFound();
  const [master, job, [app], report] = await Promise.all([
    getMasterCv(user.id),
    v.jobId ? getJob(user.id, v.jobId) : null,
    db.select({ id: applications.id }).from(applications).where(eq(applications.cvVersionId, v.id)).limit(1),
    ensureAtsReport(user.id, v),
  ]);

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/cv" className="text-sm text-muted-foreground hover:underline">
            ← CV
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{v.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatDate(v.createdAt)} ·{" "}
            {report ? (
              <>
                ATS test <strong className="text-foreground">{report.score} / 100</strong>
              </>
            ) : (
              <>
                ATS keyword match {v.atsBefore}% → <strong className="text-foreground">{v.atsAfter}%</strong>
              </>
            )}
            {app && (
              <>
                {" · "}
                <Link href={`/applications/${app.id}`} className="underline">
                  Application
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/api/cv/${v.id}/pdf`}>Download PDF</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/api/cv/${v.id}/pdf?inline=1`} target="_blank" rel="noreferrer">
              Preview
            </a>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/copy?v=${v.id}`}>Quick copy</Link>
          </Button>
          <DeleteVersion id={v.id} />
        </div>
      </div>

      {v.unsupported.length > 0 && (
        <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-critical/40 bg-critical/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
          <div>
            <strong>Check before sending:</strong> this version mentions {v.unsupported.join(", ")}, which isn&apos;t in
            your master CV or Extra facts. Remove it below, or add a true detail to Extra facts and re-tailor.
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-5">
        <aside className="grid content-start gap-4 lg:col-span-2">
          {report && (
            <section className="rounded-xl bg-card" aria-label="ATS test">
              <AtsReportCard report={report} />
            </section>
          )}
          <section className="rounded-xl border bg-card p-4 text-sm">
            <h2 className="font-medium">Keywords</h2>
            {v.matchedKeywords.length > 0 && (
              <div className="mt-2">
                <div className="mb-1 text-xs text-muted-foreground">In your CV</div>
                <div className="flex flex-wrap gap-1.5">
                  {v.matchedKeywords.map((k) => (
                    <span key={k} className="rounded-md bg-primary/10 px-2 py-0.5 text-xs">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {v.missingKeywords.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 text-xs text-muted-foreground">Missing (not invented — add only if true)</div>
                <div className="flex flex-wrap gap-1.5">
                  {v.missingKeywords.map((k) => (
                    <span key={k} className="rounded-md border border-dashed px-2 py-0.5 text-xs">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {v.gaps.length > 0 && (
            <section className="rounded-xl border bg-card p-4 text-sm">
              <h2 className="font-medium">Gaps against this job</h2>
              <ul className="mt-2 grid gap-3">
                {v.gaps.map((g, i) => (
                  <li key={i}>
                    <div className="font-medium">{g.requirement}</div>
                    <div className="text-muted-foreground">{g.note}</div>
                    <GapHelper versionId={v.id} requirement={g.requirement} note={g.note} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {v.changes.length > 0 && (
            <section className="rounded-xl border bg-card p-4 text-sm">
              <h2 className="font-medium">What changed</h2>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground">
                {v.changes.map((c, i) => (
                  <li key={i}>
                    <span className="text-foreground">{c.section}:</span> {c.reason}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {job && (
            <section className="rounded-xl border bg-card p-4 text-sm">
              <h2 className="font-medium">Job description</h2>
              <p className="text-muted-foreground">
                {job.title} · {job.company}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer text-muted-foreground">Show</summary>
                <div className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap">{job.description}</div>
              </details>
              <div className="mt-4 border-t pt-4">
                <Retailor versionId={v.id} />
              </div>
            </section>
          )}
        </aside>

        <section className="rounded-xl border bg-card p-4 lg:col-span-3">
          <h2 className="mb-4 font-medium">Edit this version</h2>
          <VersionEditor id={v.id} initial={v.data} master={master?.data} />
        </section>
      </div>
    </div>
  );
}
