import Link from "next/link";
import { and, count, eq } from "drizzle-orm";
import { db, emails } from "@/db";
import { budgetStatus } from "@/lib/ai/budget";
import { requireUser } from "@/lib/session";
import { mailSyncState } from "@/lib/stats";
import { Nav } from "@/components/shell/nav";
import { SyncButton } from "@/components/shell/sync-button";
import { UserMenu } from "@/components/shell/user-menu";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const [[review], mail, budget] = await Promise.all([
    db
      .select({ n: count() })
      .from(emails)
      .where(and(eq(emails.userId, user.id), eq(emails.needsReview, true))),
    mailSyncState(user.id),
    budgetStatus(user.id),
  ]);
  const reviewCount = review?.n ?? 0;

  return (
    <div className="flex min-h-svh flex-col md:flex-row">
      <aside className="hidden w-56 shrink-0 border-r bg-sidebar p-3 md:block">
        <Link href="/" className="mb-4 block px-3 py-2 text-lg font-semibold tracking-tight">
          tjob
        </Link>
        <Nav reviewCount={reviewCount} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b px-4 py-2 md:px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight md:hidden">
            tjob
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <SyncButton hasMailbox={Boolean(mail)} lastSyncedAt={mail?.lastSyncedAt?.toISOString() ?? null} />
            <UserMenu name={user.name} email={user.email} />
          </div>
        </header>
        <div className="border-b px-2 py-1 md:hidden">
          <Nav reviewCount={reviewCount} orientation="horizontal" />
        </div>
        {budget.configured && budget.state !== "ok" && (
          <div
            role="status"
            className={`border-b px-4 py-2 text-sm md:px-6 ${budget.state === "exceeded" ? "bg-critical/10" : "bg-warning/10"}`}
          >
            <strong>{budget.state === "exceeded" ? "AI paused." : "Heads up."}</strong>{" "}
            {`$${budget.spentUsd.toFixed(2)} of your $${budget.budgetUsd.toFixed(2)} monthly AI budget used.`}
            {budget.state === "exceeded" && " Email tracking continues with free rules; new emails wait in Review."}{" "}
            <Link href="/settings#ai" className="underline">
              Details
            </Link>
          </div>
        )}
        <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
