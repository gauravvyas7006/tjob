import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { CheckCircle2, Circle } from "lucide-react";
import { STATUS_LABELS } from "@tjob/shared";
import { apiTokens, db, masterCv, profile } from "@/db";
import { isAiConfigured } from "@/lib/ai/budget";
import { requireUser } from "@/lib/session";
import { mailSyncState, overviewStats, recentActivity, weeklyApplications } from "@/lib/stats";
import { formatDateTime, percent, timeAgo, weekLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader, StatTile } from "@/components/page-header";
import { OverviewCharts } from "./overview-charts";

export const metadata = { title: "Overview" };

async function setupSteps(userId: string) {
  const [[cv], [prof], [token], mail] = await Promise.all([
    db.select({ n: count() }).from(masterCv).where(eq(masterCv.userId, userId)),
    db.select({ notice: profile.noticePeriod }).from(profile).where(eq(profile.userId, userId)),
    db
      .select({ n: count() })
      .from(apiTokens)
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt))),
    mailSyncState(userId),
  ]);
  return [
    { done: isAiConfigured(), label: "Add your Anthropic API key (ANTHROPIC_API_KEY)", href: "/settings#ai" },
    { done: (cv?.n ?? 0) > 0, label: "Upload your CV", href: "/cv" },
    { done: Boolean(prof?.notice), label: "Fill in your standard answers (notice period, CTC…)", href: "/settings#profile" },
    { done: Boolean(mail), label: "Connect your job mailbox (IMAP/SMTP)", href: "/settings#email" },
    { done: (token?.n ?? 0) > 0, label: "Connect the Chrome extension", href: "/settings#extension" },
  ];
}

export default async function OverviewPage() {
  const user = await requireUser();
  const [stats, weekly, activity, mail, steps] = await Promise.all([
    overviewStats(user.id),
    weeklyApplications(user.id),
    recentActivity(user.id),
    mailSyncState(user.id),
    setupSteps(user.id),
  ]);
  const pending = steps.filter((s) => !s.done);
  const weekDelta = stats.thisWeek - stats.lastWeek;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={`Hi ${user.name.split(" ")[0]}`}
        description={
          mail
            ? `Mailbox ${mail.emailAddress} · last synced ${timeAgo(mail.lastSyncedAt)}${mail.lastSyncError ? ` · error: ${mail.lastSyncError}` : ""}`
            : "Connect your mailbox in Settings to track responses automatically."
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/cv#tailor">Tailor a CV</Link>
            </Button>
            <Button asChild>
              <Link href="/applications/new">Add application</Link>
            </Button>
          </>
        }
      />

      {pending.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <h2 className="font-medium">Get set up</h2>
          <ul className="mt-2 grid gap-1.5 text-sm sm:grid-cols-2">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center gap-2">
                {s.done ? (
                  <CheckCircle2 className="size-4 text-good" aria-label="Done" />
                ) : (
                  <Circle className="size-4 text-muted-foreground" aria-label="To do" />
                )}
                {s.done ? (
                  <span className="text-muted-foreground line-through">{s.label}</span>
                ) : (
                  <Link href={s.href} className="underline-offset-4 hover:underline">
                    {s.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Applied"
          value={stats.applied}
          hint={`${stats.thisWeek} this week${weekDelta !== 0 ? ` (${weekDelta > 0 ? "+" : ""}${weekDelta} vs last week)` : ""}`}
        />
        <StatTile label="Response rate" value={percent(stats.responseRate)} hint={`${stats.responded} responded`} />
        <StatTile label="Interviews" value={stats.interviews} hint="reached interview stage" />
        <StatTile label="Offers" value={stats.offers} hint={`${stats.rejected} rejected`} />
        <StatTile label="In progress" value={stats.active} hint={`${stats.saved} saved, not applied`} />
      </div>

      <OverviewCharts
        weekly={weekly.map((w) => ({ ...w, label: weekLabel(w.week) }))}
        funnel={[
          { label: "Applied", value: stats.applied },
          { label: "Got a response", value: stats.responded },
          { label: "Interview", value: stats.interviews },
          { label: "Offer", value: stats.offers },
        ]}
      />

      <section className="mt-6 rounded-xl border bg-card p-4">
        <h2 className="font-medium">Recent activity</h2>
        {activity.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Nothing yet. Save a job with the extension, add one manually, or import your LinkedIn history in Settings.
          </p>
        ) : (
          <ul className="mt-2 divide-y">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2 text-sm">
                <Link href={`/applications/${a.applicationId}`} className="font-medium hover:underline">
                  {a.company || "Unknown company"}
                </Link>
                <span className="text-muted-foreground">{a.title}</span>
                <span className="min-w-0 basis-full sm:basis-auto sm:flex-1 sm:truncate">
                  {a.type === "status_change" && a.toStatus && (
                    <span className="font-medium">→ {STATUS_LABELS[a.toStatus]} </span>
                  )}
                  <span className="text-muted-foreground">{a.detail}</span>
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(a.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
