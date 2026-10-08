import Link from "next/link";
import { and, count, desc, eq, inArray, type SQL } from "drizzle-orm";
import { EMAIL_CATEGORIES, EMAIL_CATEGORY_LABELS, type EmailCategory } from "@tjob/shared";
import { applications, db, emails } from "@/db";
import { requireUser } from "@/lib/session";
import { formatDateTime } from "@/lib/format";
import { CategoryBadge } from "@/components/badges";
import { EmptyState, PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { EmailActions } from "./client";

export const metadata = { title: "Inbox" };

export default async function InboxPage(props: PageProps<"/inbox">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const tab = sp.tab === "all" ? "all" : "review";
  const category = EMAIL_CATEGORIES.includes(sp.category as EmailCategory) ? (sp.category as EmailCategory) : null;

  const where: SQL[] = [eq(emails.userId, user.id), eq(emails.direction, "in")];
  if (tab === "review") where.push(eq(emails.needsReview, true));
  if (category) where.push(eq(emails.category, category));

  const [rows, [reviewCount], apps] = await Promise.all([
    db
      .select({
        id: emails.id,
        fromName: emails.fromName,
        fromAddress: emails.fromAddress,
        subject: emails.subject,
        summary: emails.summary,
        snippet: emails.snippet,
        category: emails.category,
        classifiedBy: emails.classifiedBy,
        receivedAt: emails.receivedAt,
        applicationId: emails.applicationId,
        company: applications.company,
        title: applications.title,
      })
      .from(emails)
      .leftJoin(applications, eq(applications.id, emails.applicationId))
      .where(and(...where))
      .orderBy(desc(emails.receivedAt))
      .limit(200),
    db
      .select({ n: count() })
      .from(emails)
      .where(and(eq(emails.userId, user.id), eq(emails.needsReview, true))),
    db
      .select({ id: applications.id, company: applications.company, title: applications.title })
      .from(applications)
      .where(and(eq(applications.userId, user.id), inArray(applications.status, ["saved", "cv_ready", "applied", "viewed", "assessment", "interview", "offer", "rejected", "ghosted"])))
      .orderBy(desc(applications.lastActivityAt))
      .limit(300),
  ]);

  const tabHref = (t: string) => `/inbox?tab=${t}${category ? `&category=${category}` : ""}`;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Inbox"
        description="Job-related emails from your mailbox. Everything else is never stored."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border p-0.5 text-sm">
          {[
            ["review", `Review (${reviewCount?.n ?? 0})`],
            ["all", "All job emails"],
          ].map(([t, label]) => (
            <Link
              key={t}
              href={tabHref(t)}
              className={cn("rounded px-3 py-1", tab === t ? "bg-accent" : "text-muted-foreground")}
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 text-xs">
          <Link
            href={`/inbox?tab=${tab}`}
            className={cn("rounded-full border px-2 py-0.5", !category ? "bg-accent" : "text-muted-foreground")}
          >
            All
          </Link>
          {EMAIL_CATEGORIES.filter((c) => c !== "other").map((c) => (
            <Link
              key={c}
              href={`/inbox?tab=${tab}&category=${c}`}
              className={cn("rounded-full border px-2 py-0.5", category === c ? "bg-accent" : "text-muted-foreground")}
            >
              {EMAIL_CATEGORY_LABELS[c]}
            </Link>
          ))}
        </div>
      </div>

      {tab === "review" && rows.length > 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          These emails weren&apos;t matched to an application or the sorting wasn&apos;t sure. Fix the category (tick
          &quot;always&quot; to make a free rule for that sender) or link them to the right application.
        </p>
      )}

      {rows.length === 0 ? (
        <EmptyState title={tab === "review" ? "Nothing to review" : "No job emails yet"}>
          {tab === "review"
            ? "New emails are matched to applications automatically."
            : "Connect your mailbox in Settings → Email, then click Sync now."}
        </EmptyState>
      ) : (
        <ul className="grid gap-2">
          {rows.map((m) => (
            <li key={m.id} className="rounded-xl border bg-card p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <CategoryBadge category={m.category} />
                <span className="truncate">{m.fromName ? `${m.fromName} <${m.fromAddress}>` : m.fromAddress}</span>
                <span className="ml-auto">{formatDateTime(m.receivedAt)}</span>
              </div>
              <div className="mt-1 font-medium">{m.subject}</div>
              <div className="text-sm text-muted-foreground">
                {m.classifiedBy === "budget" ? "Waiting for AI sorting (monthly budget reached). " : ""}
                {m.summary || m.snippet}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                {m.applicationId ? (
                  <Link href={`/applications/${m.applicationId}`} className="hover:underline">
                    → {m.company} · {m.title}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">Not linked to an application</span>
                )}
              </div>
              <EmailActions
                emailId={m.id}
                category={m.category}
                linked={Boolean(m.applicationId)}
                inReview={tab === "review"}
                apps={apps.map((a) => ({ id: a.id, label: `${a.company} · ${a.title}` }))}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
