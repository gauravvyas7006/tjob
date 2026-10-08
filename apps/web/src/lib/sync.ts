import "server-only";
import { eq } from "drizzle-orm";
import { db, mailAccounts } from "@/db";
import { markGhosted } from "./applications";
import { classifyPendingNow, pollBatches, requeueBudgetHeld, submitPendingBatch } from "./mail/batch";
import { syncMailAccount, type AccountSyncResult } from "./mail/imap-sync";

export interface SyncSummary {
  accounts: AccountSyncResult[];
  batchApplied: number;
  batchSubmitted: number;
  classifiedNow: number;
  ghosted: number;
  ms: number;
}

/**
 * One sync pass: read new mail for each mailbox, apply finished AI batches, submit/classify
 * pending emails, and mark ghosted applications. Fits inside a 300 s Vercel function.
 */
export async function runSync(opts: { userId?: string; budgetMs?: number } = {}): Promise<SyncSummary> {
  const start = Date.now();
  const deadline = start + (opts.budgetMs ?? 240_000);
  const accounts = opts.userId
    ? await db.select().from(mailAccounts).where(eq(mailAccounts.userId, opts.userId))
    : await db.select().from(mailAccounts);

  const summary: SyncSummary = { accounts: [], batchApplied: 0, batchSubmitted: 0, classifiedNow: 0, ghosted: 0, ms: 0 };
  for (const account of accounts) {
    // Leave ~40 s for the AI/batch steps after reading mail.
    summary.accounts.push(await syncMailAccount(account, deadline - 40_000));
  }

  const userIds = new Set(accounts.map((a) => a.userId));
  if (opts.userId) userIds.add(opts.userId);
  for (const userId of userIds) {
    await requeueBudgetHeld(userId);
    summary.batchApplied += await pollBatches(userId, deadline);
    summary.batchSubmitted += await submitPendingBatch(userId);
    summary.classifiedNow += await classifyPendingNow(userId, deadline);
    summary.ghosted += await markGhosted(userId);
  }
  summary.ms = Date.now() - start;
  return summary;
}
