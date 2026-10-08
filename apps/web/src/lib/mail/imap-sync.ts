import "server-only";
import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { simpleParser } from "mailparser";
import { applications, db, emails, mailAccounts } from "@/db";
import { decryptSecret } from "@/lib/crypto";
import { cleanEmailText, htmlToText } from "./body";
import { imapClient } from "./imap";
import { loadUserRules, processIncomingMail, type ProcessOutcome } from "./process";
import { isPotentiallyRelevant } from "./rules";

export type MailAccount = typeof mailAccounts.$inferSelect;

export interface AccountSyncResult {
  accountId: string;
  skipped?: "locked";
  scanned: number;
  relevant: number;
  outcomes: Partial<Record<ProcessOutcome, number>>;
  /** All available mail processed (false = stopped at the time budget; next run continues). */
  complete: boolean;
  error?: string;
}

const LOCK_MS = 6 * 60 * 1000;
const CHUNK = 100;
/** During the first sync, AI work is deferred to the (50% cheaper) Batch API above this count. */
const BATCH_THRESHOLD = 20;

function threadKeyFrom(headers: Buffer | undefined, messageId: string): string {
  const raw = headers?.toString("utf8") ?? "";
  const unfolded = raw.replace(/\r?\n[ \t]+/g, " ");
  const refs = unfolded.match(/^references:\s*(.+)$/im)?.[1]?.match(/<[^>]+>/g);
  if (refs?.length) return refs[0];
  const irt = unfolded.match(/^in-reply-to:\s*(<[^>]+>)/im)?.[1];
  return irt ?? messageId;
}

async function acquireLock(accountId: string): Promise<boolean> {
  const now = new Date();
  const rows = await db
    .update(mailAccounts)
    .set({ lockedUntil: new Date(now.getTime() + LOCK_MS) })
    .where(and(eq(mailAccounts.id, accountId), or(isNull(mailAccounts.lockedUntil), lt(mailAccounts.lockedUntil, now))))
    .returning({ id: mailAccounts.id });
  return rows.length > 0;
}

async function prefilterContext(userId: string) {
  const apps = await db
    .select({ companyKey: applications.companyKey })
    .from(applications)
    .where(eq(applications.userId, userId));
  const threads = await db
    .select({ threadKey: emails.threadKey })
    .from(emails)
    .where(and(eq(emails.userId, userId), isNotNull(emails.applicationId)));
  return {
    knownCompanyKeys: new Set(apps.map((a) => a.companyKey).filter(Boolean)),
    knownThreadKeys: new Set(threads.map((t) => t.threadKey)),
  };
}

/**
 * Incremental IMAP sync for one mailbox. First run reads the last `backfillDays` days; after that
 * only UIDs above `lastUid`. Stops at `deadline` and saves its position so the next run resumes.
 */
export async function syncMailAccount(account: MailAccount, deadline: number): Promise<AccountSyncResult> {
  const result: AccountSyncResult = { accountId: account.id, scanned: 0, relevant: 0, outcomes: {}, complete: false };
  if (!(await acquireLock(account.id))) return { ...result, skipped: "locked" };

  const client = imapClient({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
    user: account.imapUser,
    pass: decryptSecret(account.imapPasswordEnc),
  });

  let lastUid = account.lastUid;
  let backfillDone = account.backfillDone;
  let uidValidity = account.uidValidity;

  try {
    await client.connect();
    const box = await client.mailboxOpen(account.mailbox || "INBOX", { readOnly: true });
    const validity = box.uidValidity.toString();
    if (uidValidity && uidValidity !== validity) {
      // Mailbox was rebuilt by the server: UIDs changed, re-scan the backfill window.
      lastUid = 0;
      backfillDone = false;
    }
    uidValidity = validity;

    const found = backfillDone
      ? await client.search({ uid: `${lastUid + 1}:*` }, { uid: true })
      : await client.search({ since: new Date(Date.now() - account.backfillDays * 864e5) }, { uid: true });
    const uids = (found || []).filter((u) => u > lastUid).sort((a, b) => a - b);

    const ctx = await prefilterContext(account.userId);
    const userRules = await loadUserRules(account.userId);
    const deferAi = !backfillDone && uids.length > BATCH_THRESHOLD;
    const self = account.emailAddress.toLowerCase();

    let stopped = false;
    for (let i = 0; i < uids.length && !stopped; i += CHUNK) {
      const chunk = uids.slice(i, i + CHUNK);
      const metas = await client.fetchAll(
        chunk.join(","),
        { uid: true, envelope: true, internalDate: true, headers: ["references", "in-reply-to"] },
        { uid: true },
      );
      const byUid = new Map(metas.map((m) => [m.uid, m]));

      for (const uid of chunk) {
        if (Date.now() > deadline) {
          stopped = true;
          break;
        }
        result.scanned++;
        const meta = byUid.get(uid);
        const from = meta?.envelope?.from?.[0];
        const fromAddress = (from?.address ?? "").toLowerCase();
        const subject = meta?.envelope?.subject ?? "";
        const messageId = meta?.envelope?.messageId ?? `<uid-${uidValidity}-${uid}@tjob>`;
        const threadKey = threadKeyFrom(meta?.headers, messageId);

        const relevant =
          meta &&
          fromAddress &&
          fromAddress !== self &&
          isPotentiallyRelevant({ fromAddress, subject }, { ...ctx, threadKey });

        if (relevant) {
          result.relevant++;
          const full = await client.fetchOne(String(uid), { uid: true, source: { maxLength: 300_000 } }, { uid: true });
          if (full && full.source) {
            const parsed = await simpleParser(full.source);
            const rawText = parsed.text || (parsed.html ? htmlToText(parsed.html) : "");
            const outcome = await processIncomingMail(
              account.userId,
              account.id,
              {
                uid,
                messageId,
                threadKey,
                fromAddress,
                fromName: from?.name ?? "",
                toAddress: meta.envelope?.to?.[0]?.address ?? "",
                subject,
                receivedAt: new Date(meta.internalDate ?? meta.envelope?.date ?? Date.now()),
                text: cleanEmailText(rawText),
              },
              { userRules, deferAi },
            );
            result.outcomes[outcome] = (result.outcomes[outcome] ?? 0) + 1;
          }
        }
        lastUid = uid;
      }
      await db.update(mailAccounts).set({ lastUid, uidValidity }).where(eq(mailAccounts.id, account.id));
    }

    result.complete = !stopped;
    if (result.complete) backfillDone = true;
    await db
      .update(mailAccounts)
      .set({ lastUid, uidValidity, backfillDone, lastSyncedAt: new Date(), lastSyncError: null })
      .where(eq(mailAccounts.id, account.id));
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    await db
      .update(mailAccounts)
      .set({ lastUid, uidValidity, lastSyncError: result.error.slice(0, 500), lastSyncedAt: new Date() })
      .where(eq(mailAccounts.id, account.id));
  } finally {
    await client.logout().catch(() => {});
    await db.update(mailAccounts).set({ lockedUntil: null }).where(eq(mailAccounts.id, account.id));
  }
  return result;
}
