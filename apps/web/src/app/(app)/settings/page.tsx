import { desc, eq } from "drizzle-orm";
import { AI_FEATURE_LABELS, type AiFeature } from "@tjob/shared";
import { apiTokens, db, mailAccounts, profile, savedAnswers } from "@/db";
import { budgetStatus, usageByFeature } from "@/lib/ai/budget";
import { appUrl } from "@/lib/env";
import { requireUser } from "@/lib/session";
import { formatDate, timeAgo, usd } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";
import { CopyCode } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { CsvImport, MailForm, ProfileForm, SavedAnswers, TokenManager } from "./client";

export const metadata = { title: "Settings" };

function Section({ id, title, description, children }: { id: string; title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border bg-card p-5">
      <h2 className="font-medium">{title}</h2>
      {description && <div className="mt-1 text-sm text-muted-foreground">{description}</div>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{title}</div>
        <div className="mt-1 text-muted-foreground [&_strong]:text-foreground">{children}</div>
      </div>
    </li>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const [[prof], [mail], tokens, answers, budget, usage] = await Promise.all([
    db.select().from(profile).where(eq(profile.userId, user.id)),
    db.select().from(mailAccounts).where(eq(mailAccounts.userId, user.id)),
    db.select().from(apiTokens).where(eq(apiTokens.userId, user.id)).orderBy(desc(apiTokens.createdAt)),
    db.select().from(savedAnswers).where(eq(savedAnswers.userId, user.id)).orderBy(desc(savedAnswers.updatedAt)).limit(200),
    budgetStatus(user.id),
    usageByFeature(user.id),
  ]);
  const pct = Math.min(100, Math.round(budget.fraction * 100));
  const lastExtensionUse = tokens
    .filter((t) => !t.revokedAt && t.lastUsedAt)
    .map((t) => t.lastUsedAt as Date)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return (
    <div className="mx-auto grid max-w-4xl gap-6">
      <PageHeader title="Settings" />

      <Section
        id="profile"
        title="Profile & standard answers"
        description="Used by the extension's Autofill for common questions (notice period, CTC, experience…). Free — no AI needed."
      >
        <ProfileForm
          initial={{
            fullName: prof?.fullName || user.name,
            phone: prof?.phone ?? "",
            location: prof?.location ?? "",
            totalExperience: prof?.totalExperience ?? "",
            currentCtc: prof?.currentCtc ?? "",
            expectedCtc: prof?.expectedCtc ?? "",
            noticePeriod: prof?.noticePeriod ?? "",
            preferredLocations: prof?.preferredLocations ?? "",
            linkedinUrl: prof?.linkedinUrl ?? "",
            githubUrl: prof?.githubUrl ?? "",
            portfolioUrl: prof?.portfolioUrl ?? "",
          }}
        />
      </Section>

      <Section
        id="email"
        title="Email"
        description={
          <>
            The mailbox LinkedIn and Naukri send to. tjob reads it over IMAP (job-related emails only) and sends
            follow-ups over SMTP. Passwords are encrypted. For Gmail, turn on 2-Step Verification and create an{" "}
            <a className="underline" href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">
              App Password
            </a>
            .
            {mail && (
              <span className="mt-2 block">
                Status: last synced {timeAgo(mail.lastSyncedAt)}
                {mail.backfillDone ? "" : ` · first ${mail.backfillDays}-day scan in progress`}
                {mail.lastSyncError ? ` · last error: ${mail.lastSyncError}` : ""}
              </span>
            )}
          </>
        }
      >
        <MailForm
          initial={
            mail
              ? {
                  emailAddress: mail.emailAddress,
                  imapHost: mail.imapHost,
                  imapPort: mail.imapPort,
                  imapSecure: mail.imapSecure,
                  imapUser: mail.imapUser,
                  smtpHost: mail.smtpHost,
                  smtpPort: mail.smtpPort,
                  smtpSecure: mail.smtpSecure,
                  smtpUser: mail.smtpUser,
                  fromName: mail.fromName,
                  backfillDays: mail.backfillDays,
                }
              : null
          }
        />
      </Section>

      <Section
        id="extension"
        title="Chrome extension"
        description="Saves LinkedIn and Naukri jobs, tailors your CV and fills application forms. You always click Next and Submit yourself."
      >
        {lastExtensionUse && (
          <p className="mb-4 flex items-center gap-2 text-sm">
            <CheckCircle2 className="size-4 shrink-0 text-good" aria-hidden />
            Connected. The extension last reached tjob {timeAgo(lastExtensionUse)}.
          </p>
        )}
        <ol className="grid gap-5 text-sm">
          <Step n={1} title="Load it in Chrome">
            Paste <CopyCode value="chrome://extensions" /> into Chrome&apos;s address bar (web pages can&apos;t link to it)
            and turn on <strong>Developer mode</strong> at the top right. Click <strong>Load unpacked</strong> and choose
            the <strong>chrome-mv3</strong> folder inside your tjob code folder:{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs break-all">tjob\apps\extension\.output\chrome-mv3</code>
            <span className="mt-1 block">
              Folder missing? Run <CopyCode value="npm run ext:build" /> in the tjob folder first.
            </span>
          </Step>
          <Step n={2} title="Pin it">
            Click the puzzle-piece icon in Chrome&apos;s toolbar and pin <strong>tjob</strong>.
          </Step>
          <Step n={3} title="Create a token">
            Copy it straight away: it&apos;s shown only once.
            <div className="mt-3">
              <TokenManager
                tokens={tokens.map((t) => ({
                  id: t.id,
                  name: t.name,
                  created: formatDate(t.createdAt),
                  lastUsed: t.lastUsedAt ? timeAgo(t.lastUsedAt) : "never",
                  revoked: Boolean(t.revokedAt),
                }))}
              />
            </div>
          </Step>
          <Step n={4} title="Connect">
            Click the tjob icon in Chrome, enter this address, paste the token and click <strong>Connect</strong>:{" "}
            <CopyCode value={appUrl()} />
          </Step>
          <Step n={5} title="Use it">
            Open any LinkedIn or Naukri job page. The tjob panel shows <strong>Save</strong>, <strong>Tailor CV</strong>,{" "}
            <strong>Autofill</strong> and <strong>Mark applied</strong>. On their applied-jobs pages it also offers{" "}
            <strong>Import this page</strong>.
          </Step>
        </ol>
        <p className="mt-5 text-xs text-muted-foreground">
          After updating the tjob code, run <code>npm run ext:build</code> again, then click the reload icon on the tjob
          card in chrome://extensions.
        </p>
      </Section>

      <Section
        id="import"
        title="Import LinkedIn history"
        description={
          <>
            On LinkedIn: Settings → Data privacy → Get a copy of your data → tick <em>Job applications</em> → Request
            archive. When the email arrives, download it and upload <code>Job Applications.csv</code> here.
          </>
        }
      >
        <CsvImport />
      </Section>

      <Section
        id="answers"
        title="Saved application answers"
        description="Answers Autofill reuses. Ones you submit through the extension are saved automatically; AI-drafted ones are marked."
      >
        <SavedAnswers answers={answers.map((a) => ({ id: a.id, question: a.question, answer: a.answer, source: a.source, uses: a.useCount }))} />
      </Section>

      <Section
        id="ai"
        title="AI usage"
        description={
          budget.configured
            ? "Claude API spend this calendar month (UTC). At the budget, AI pauses and tracking falls back to free rules."
            : "ANTHROPIC_API_KEY is not set, so AI features are off. Rules-based email tracking still works."
        }
      >
        <div className="grid gap-4">
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span>
                <strong className="text-lg">{usd(budget.spentUsd)}</strong> of {usd(budget.budgetUsd)}
              </span>
              <span className="text-muted-foreground">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-primary/15" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI budget used">
              <div
                className={`h-2 rounded-full ${budget.state === "exceeded" ? "bg-critical" : budget.state === "warn" ? "bg-warning" : "bg-primary"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 font-medium">Feature</th>
                <th className="py-1.5 text-right font-medium">Calls</th>
                <th className="py-1.5 text-right font-medium">Tokens in / out</th>
                <th className="py-1.5 text-right font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-3 text-muted-foreground">
                    No AI calls this month.
                  </td>
                </tr>
              ) : (
                usage.map((u) => (
                  <tr key={u.feature} className="border-b last:border-0">
                    <td className="py-1.5">{AI_FEATURE_LABELS[u.feature as AiFeature] ?? u.feature}</td>
                    <td className="py-1.5 text-right tabular-nums">{u.calls}</td>
                    <td className="py-1.5 text-right tabular-nums">
                      {u.inputTokens.toLocaleString("en-IN")} / {u.outputTokens.toLocaleString("en-IN")}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{usd(Number(u.costUsd))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
