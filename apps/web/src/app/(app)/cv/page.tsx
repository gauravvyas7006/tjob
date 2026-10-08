import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { applications, cvVersions, db } from "@/db";
import { ATS_BAND_LABELS } from "@/lib/cv/ats-check";
import { getMasterCv } from "@/lib/cv/service";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BlankCvButton, ExtraFacts, MasterEditor, TailorForm, UploadCv } from "./client";
import { CvFileCheck } from "./file-check";

export const metadata = { title: "CV" };
export const maxDuration = 120;

export default async function CvPage() {
  const user = await requireUser();
  const [master, versions] = await Promise.all([
    getMasterCv(user.id),
    db
      .select({
        id: cvVersions.id,
        title: cvVersions.title,
        atsBefore: cvVersions.atsBefore,
        atsAfter: cvVersions.atsAfter,
        atsReport: cvVersions.atsReport,
        createdAt: cvVersions.createdAt,
        appId: applications.id,
        appStatus: applications.status,
      })
      .from(cvVersions)
      .leftJoin(applications, eq(applications.cvVersionId, cvVersions.id))
      .where(eq(cvVersions.userId, user.id))
      .orderBy(desc(cvVersions.createdAt))
      .limit(200),
  ]);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="CV"
        description="Your master CV is the single source of truth. Tailored versions only reword and reorder what's here (plus Extra facts) — they never invent experience."
        actions={
          master && (
            <>
              <Button asChild variant="outline">
                <Link href="/copy">Quick copy</Link>
              </Button>
              <Button asChild variant="outline">
                <a href="/api/cv/master/pdf?inline=1" target="_blank" rel="noreferrer">
                  Preview ATS PDF
                </a>
              </Button>
              <Button asChild variant="outline">
                <a href="/api/cv/master/pdf">Download PDF</a>
              </Button>
              <Button asChild variant="outline">
                <a href="/api/cv/master/docx">Word (.docx)</a>
              </Button>
            </>
          )
        }
      />

      {!master ? (
        <section className="grid gap-4 rounded-xl border bg-card p-5">
          <div>
            <h2 className="font-medium">Upload your current CV</h2>
            <p className="text-sm text-muted-foreground">
              tjob reads it once (about $0.04) and turns it into an editable, structured CV.
            </p>
          </div>
          <UploadCv />
          <div className="text-sm text-muted-foreground">
            No API key yet? <BlankCvButton /> and type it in.
          </div>
        </section>
      ) : (
        <>
          <section id="tailor" className="mb-6 rounded-xl border bg-card p-5">
            <h2 className="font-medium">Tailor for a job</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Paste a job description to get a version of your CV aimed at it (about $0.03). Using the Chrome extension
              does this straight from the LinkedIn or Naukri page. For follow-up changes in a chat, use{" "}
              <Link href="/tailor" className="underline">
                Tailor CV
              </Link>
              .
            </p>
            <TailorForm />
          </section>

          <section className="mb-6 rounded-xl border bg-card p-5">
            <h2 className="font-medium">Tailored versions</h2>
            {versions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <Table className="mt-2">
                <TableHeader>
                  <TableRow>
                    <TableHead>Version</TableHead>
                    <TableHead>ATS test</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Download</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {versions.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>
                        <Link href={`/cv/${v.id}`} className="font-medium hover:underline">
                          {v.title}
                        </Link>
                        {v.appId && (
                          <div className="text-xs text-muted-foreground">
                            <Link href={`/applications/${v.appId}`} className="hover:underline">
                              Linked application
                            </Link>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm tabular-nums">
                        {v.atsReport ? (
                          <>
                            <strong>{v.atsReport.score} / 100</strong>
                            <div className="text-xs text-muted-foreground">{ATS_BAND_LABELS[v.atsReport.band]}</div>
                          </>
                        ) : (
                          <>
                            Keywords {v.atsBefore}% → <strong>{v.atsAfter}%</strong>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{formatDate(v.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/api/cv/${v.id}/pdf`}>PDF</a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="mb-6 rounded-xl border bg-card p-5">
            <h2 className="font-medium">How an ATS reads your CV</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Designed CVs (two columns, icons, text boxes) often come out scrambled in applicant tracking systems.
              This reads your uploaded file the way they do and compares it with tjob&apos;s PDF. Free, no AI.
            </p>
            <CvFileCheck />
          </section>

          <section className="mb-6 rounded-xl border bg-card p-5">
            <h2 className="font-medium">Extra facts</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              True details that aren&apos;t on your CV yet: technologies you used on MARS, scale, results, tools. Tailoring
              may use these. Anything not here or in your CV is listed as a gap instead of being added.
            </p>
            <ExtraFacts initial={master.extraFacts} />
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-medium">Master CV</h2>
                <p className="text-sm text-muted-foreground">
                  {master.originalFileName ? `From ${master.originalFileName}` : "Typed in"}
                  {master.parsedAt ? ` · read ${formatDate(master.parsedAt)}` : ""}
                </p>
              </div>
              <UploadCv compact />
            </div>
            <MasterEditor initial={master.data} />
          </section>
        </>
      )}
      {master && versions.length === 0 && (
        <div className="mt-6">
          <EmptyState title="Tip">
            Install the Chrome extension (Settings → Extension) and click <strong>Tailor CV</strong> on any LinkedIn or
            Naukri job.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
