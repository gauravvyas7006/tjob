import Link from "next/link";
import { AlertTriangle, FileDown, Plus } from "lucide-react";
import { budgetStatus } from "@/lib/ai/budget";
import { ensureAtsReport, getMasterCv, tailorThread, tailorThreads, type CvVersion } from "@/lib/cv/service";
import { timeAgo } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { AtsReportCard } from "@/components/ats-report";
import { GapHelper } from "@/components/gap-helper";
import { EmptyState, PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Bubble } from "./bubble";
import { TailorChat } from "./client";

export const metadata = { title: "Tailor CV" };
// Tailoring takes 20–40 s (job extraction + rewrite).
export const maxDuration = 120;

const UUID = /^[0-9a-f-]{36}$/i;

function Intro() {
  return (
    <Bubble from="tjob">
      <p>Paste a job description and I&apos;ll rewrite your CV for it:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        <li>the job&apos;s own keywords, so applicant tracking systems (ATS) match your CV to it;</li>
        <li>your most relevant work and skills first;</li>
        <li>a PDF in a simple one-column layout that ATS software can read;</li>
        <li>
          an ATS test of that PDF: a score out of 100 for your chance of getting through automated screening, with what
          to fix.
        </li>
      </ul>
      <p className="mt-2">
        ATS fixes happen automatically: your headline leads with the job&apos;s title, skills use the job&apos;s own words,
        and the CV is cut to 2 pages.
      </p>
      <p className="mt-2 text-muted-foreground">
        I only reword what&apos;s in your CV and Extra facts; past job titles and experience stay as they are. Skills the
        job wants that you don&apos;t have are listed as gaps, or under &ldquo;Currently learning&rdquo; if you tick that
        box below. Each CV costs about $0.03.
      </p>
    </Bubble>
  );
}

function JobDescription({ title, company, description }: { title: string; company: string; description: string }) {
  return (
    <Bubble from="you">
      {(title || company) && <p className="mb-1 font-medium">{[title, company].filter(Boolean).join(" · ")}</p>}
      <details className="group">
        <summary className="cursor-pointer list-none">
          <span className="line-clamp-6 whitespace-pre-wrap group-open:hidden">{description}</span>
          <span className="mt-1 inline-block text-xs underline group-open:hidden">Show the full description</span>
          <span className="hidden text-xs underline group-open:inline">Hide</span>
        </summary>
        <div className="mt-2 whitespace-pre-wrap">{description}</div>
      </details>
    </Bubble>
  );
}

/** Open on the latest reply, folded on older ones. */
function Section({ title, open, children }: { title: string; open: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="mt-4">
      <summary className="cursor-pointer font-medium">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

function Reply({ v, latest }: { v: CvVersion; latest: boolean }) {
  return (
    <Bubble from="tjob">
      <p>
        Here&apos;s your CV for <strong>{v.title}</strong>.
      </p>
      <div className="mt-3">
        {v.atsReport ? (
          <AtsReportCard report={v.atsReport} open={latest} />
        ) : (
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Job keywords your CV covers</div>
            <div className="text-xl font-semibold tabular-nums">
              {v.atsBefore}% <span className="text-muted-foreground">→</span> {v.atsAfter}%
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href={`/api/cv/${v.id}/pdf`}>
            <FileDown className="size-4" aria-hidden />
            Download PDF
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/cv/${v.id}/pdf?inline=1`} target="_blank" rel="noreferrer">
            Preview
          </a>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/cv/${v.id}`}>Edit by hand</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/copy?v=${v.id}`}>Quick copy</Link>
        </Button>
      </div>

      {v.unsupported.length > 0 && (
        <p role="alert" className="mt-3 flex gap-2 rounded-lg border border-critical/40 bg-critical/5 p-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden />
          <span>
            Check before sending: this version mentions {v.unsupported.join(", ")}, which isn&apos;t in your CV or Extra
            facts. Remove it with Edit by hand, or ask me to leave it out.
          </span>
        </p>
      )}

      {v.changes.length > 0 && (
        <Section title="What I changed" open={latest}>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            {v.changes.map((c, i) => (
              <li key={i}>
                <span className="text-foreground">{c.section}:</span> {c.reason}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {v.gaps.length > 0 && (
        <Section title={`Not in your CV (${v.gaps.length})`} open={latest}>
          <p className="mb-2 text-muted-foreground">
            I didn&apos;t add these. If one fits your real work, let me suggest where it fits in your projects, or write
            a rough note and I&apos;ll fix the wording. You check it before it&apos;s saved.
          </p>
          <ul className="grid gap-4">
            {v.gaps.map((g, i) => (
              <li key={i}>
                <div className="font-medium">{g.requirement}</div>
                <div className="text-muted-foreground">{g.note}</div>
                {latest && <GapHelper versionId={v.id} requirement={g.requirement} note={g.note} />}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </Bubble>
  );
}

export default async function TailorPage(props: PageProps<"/tailor">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const jobId = typeof sp.job === "string" && UUID.test(sp.job) ? sp.job : null;
  const [master, threads, thread, budget] = await Promise.all([
    getMasterCv(user.id),
    tailorThreads(user.id),
    jobId ? tailorThread(user.id, jobId) : null,
    budgetStatus(user.id),
  ]);

  if (!master) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Tailor CV" />
        <EmptyState title="Add your CV first">
          <p>
            Tailoring rewrites your master CV, so upload it on the{" "}
            <Link href="/cv" className="underline">
              CV page
            </Link>{" "}
            first.
          </p>
        </EmptyState>
      </div>
    );
  }

  const disabledReason = !budget.configured
    ? "Tailoring needs an Anthropic API key: add ANTHROPIC_API_KEY to the environment."
    : budget.state === "exceeded"
      ? `This month's AI budget is used up ($${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)}). Tailoring resumes next month, or raise AI_MONTHLY_BUDGET_USD.`
      : null;
  const footnote = `about $0.03 per CV · $${budget.spentUsd.toFixed(2)} of $${budget.budgetUsd.toFixed(2)} AI budget used this month`;
  const versions = thread?.versions ?? [];
  const current = thread ? thread.job.id : null;
  // Versions made before the ATS test existed get tested the first time they're opened.
  const latest = versions.at(-1);
  if (latest && !latest.atsReport) latest.atsReport = await ensureAtsReport(user.id, latest);

  return (
    <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-3">
        <Button asChild variant={current ? "outline" : "default"}>
          <Link href="/tailor">
            <Plus className="size-4" aria-hidden />
            New job description
          </Link>
        </Button>
        {threads.length > 0 && (
          <nav aria-label="Earlier chats" className="max-h-48 overflow-y-auto lg:max-h-[70vh]">
            <ul className="grid gap-1">
              {threads.map((t) => (
                <li key={t.jobId}>
                  <Link
                    href={`/tailor?job=${t.jobId}`}
                    aria-current={t.jobId === current ? "page" : undefined}
                    className={cn(
                      "block rounded-md px-3 py-2 text-sm",
                      t.jobId === current ? "bg-accent" : "hover:bg-accent/60",
                    )}
                  >
                    <span className="block truncate font-medium">{t.title || "Untitled job"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[t.company, `${t.versions} ${t.versions === 1 ? "version" : "versions"}`, timeAgo(t.lastAt)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>

      <section
        aria-label="Tailor chat"
        className="flex h-[calc(100svh-9rem)] min-h-[28rem] flex-col overflow-hidden rounded-xl border bg-card"
      >
        <header className="border-b px-4 py-3">
          <h1 className="font-semibold tracking-tight">
            {thread ? thread.job.title || "Tailor CV" : "Tailor CV"}
          </h1>
          <p className="text-xs text-muted-foreground">
            {thread
              ? [thread.job.company, "ask for changes below, or paste another job description"].filter(Boolean).join(" · ")
              : "Paste a job description to get your CV rewritten for it"}
          </p>
        </header>
        <TailorChat
          key={current ?? "new"}
          jobId={current}
          versionCount={versions.length}
          disabledReason={disabledReason}
          footnote={footnote}
        >
          {thread ? (
            <>
              <JobDescription title={thread.job.title} company={thread.job.company} description={thread.job.description} />
              {versions.map((v, i) => (
                <div key={v.id} className="space-y-4">
                  {v.focusNote ? (
                    <Bubble from="you">
                      <p className="whitespace-pre-wrap">{v.focusNote}</p>
                    </Bubble>
                  ) : (
                    i > 0 && <p className="text-center text-xs text-muted-foreground">Tailored again</p>
                  )}
                  <Reply v={v} latest={i === versions.length - 1} />
                </div>
              ))}
              {latest && master.updatedAt > latest.createdAt && (
                <Bubble from="tjob">
                  <p>
                    You&apos;ve changed your CV or Extra facts since this version. Press <strong>Tailor again</strong> below
                    to use the new details.
                  </p>
                </Bubble>
              )}
            </>
          ) : (
            <Intro />
          )}
        </TailorChat>
      </section>
    </div>
  );
}
