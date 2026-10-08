import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { aiBatches, db, emails } from "@/db";
import { anthropic } from "@/lib/ai/client";
import { AiUnavailableError, budgetStatus, isAiConfigured, recordUsage } from "@/lib/ai/budget";
import {
  CLASSIFY_MODEL,
  CLASSIFY_SYSTEM,
  classifyEmail,
  classifyUserPrompt,
  emailClassificationSchema,
} from "@/lib/ai/classify-email";
import { usageFrom, type TokenUsage } from "@/lib/ai/pricing";
import { classifyStoredEmail } from "./process";

/** Batch only pays off for a backlog; a few emails are classified immediately instead. */
const MIN_BATCH = 15;
/** Conservative per-email batch cost estimate (Haiku, ~1.5k in / 150 out, 50% off). */
const EST_BATCH_COST = 0.0015;
const EST_DIRECT_COST = 0.003;

function toAiInput(e: typeof emails.$inferSelect) {
  return {
    from: `${e.fromName} <${e.fromAddress}>`,
    subject: e.subject,
    date: e.receivedAt.toISOString(),
    body: e.pendingBody ?? e.snippet,
  };
}

async function pendingEmails(userId: string, limit: number) {
  return db
    .select()
    .from(emails)
    .where(and(eq(emails.userId, userId), eq(emails.classifiedBy, "pending")))
    .orderBy(asc(emails.receivedAt))
    .limit(limit);
}

/** Submit pending emails to the Message Batches API (50% cheaper). Returns how many were sent. */
export async function submitPendingBatch(userId: string): Promise<number> {
  if (!isAiConfigured()) return 0;
  const pending = await pendingEmails(userId, 1000);
  if (pending.length < MIN_BATCH) return 0;

  const budget = await budgetStatus(userId);
  const affordable = Math.floor(Math.max(0, budget.budgetUsd - budget.spentUsd) / EST_BATCH_COST);
  const batchEmails = pending.slice(0, affordable);
  if (!batchEmails.length) return 0;

  const format = zodOutputFormat(emailClassificationSchema);
  const batch = await anthropic().messages.batches.create({
    requests: batchEmails.map((e) => ({
      custom_id: e.id,
      params: {
        model: CLASSIFY_MODEL,
        max_tokens: 512,
        system: CLASSIFY_SYSTEM,
        messages: [{ role: "user" as const, content: classifyUserPrompt(toAiInput(e)) }],
        output_config: { format: { type: format.type, schema: format.schema } },
      },
    })),
  });

  await db.insert(aiBatches).values({
    id: batch.id,
    userId,
    kind: "classify_email",
    status: "in_progress",
    requestCount: batchEmails.length,
  });
  await db
    .update(emails)
    .set({ classifiedBy: "batched" })
    .where(inArray(emails.id, batchEmails.map((e) => e.id)));
  return batchEmails.length;
}

/** Apply results of finished batches. Returns how many emails were classified. */
export async function pollBatches(userId: string, deadline: number): Promise<number> {
  if (!isAiConfigured()) return 0;
  const open = await db
    .select()
    .from(aiBatches)
    .where(and(eq(aiBatches.userId, userId), eq(aiBatches.status, "in_progress")));
  let applied = 0;

  for (const b of open) {
    if (Date.now() > deadline) break;
    const info = await anthropic().messages.batches.retrieve(b.id);
    if (info.processing_status !== "ended") continue;

    const total: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
    const retry: string[] = [];
    for await (const r of await anthropic().messages.batches.results(b.id)) {
      const [email] = await db.select().from(emails).where(eq(emails.id, r.custom_id));
      if (!email) continue;
      if (r.result.type !== "succeeded") {
        retry.push(email.id);
        continue;
      }
      const u = usageFrom(r.result.message.usage);
      total.inputTokens += u.inputTokens;
      total.outputTokens += u.outputTokens;
      total.cacheReadTokens += u.cacheReadTokens;
      total.cacheWriteTokens += u.cacheWriteTokens;
      const text = r.result.message.content.find((c) => c.type === "text");
      let parsed;
      try {
        parsed = emailClassificationSchema.safeParse(text && text.type === "text" ? JSON.parse(text.text) : null);
      } catch {
        parsed = null;
      }
      if (!parsed?.success) {
        retry.push(email.id);
        continue;
      }
      await classifyStoredEmail(userId, email, parsed.data, "ai");
      applied++;
    }
    if (retry.length) {
      await db.update(emails).set({ classifiedBy: "pending" }).where(inArray(emails.id, retry));
    }
    await recordUsage(userId, "classify_email", CLASSIFY_MODEL, total, true);
    await db
      .update(aiBatches)
      .set({ status: "applied", completedAt: new Date() })
      .where(eq(aiBatches.id, b.id));
  }
  return applied;
}

/**
 * Classify a small number of pending emails right away (incremental syncs, leftovers, or emails
 * that waited for the budget to reset).
 */
export async function classifyPendingNow(userId: string, deadline: number, max = 25): Promise<number> {
  if (!isAiConfigured()) return 0;
  const pending = await pendingEmails(userId, max);
  if (!pending.length || pending.length >= MIN_BATCH) return 0;
  const budget = await budgetStatus(userId);
  if (budget.spentUsd + pending.length * EST_DIRECT_COST > budget.budgetUsd) return 0;

  let done = 0;
  for (const e of pending) {
    if (Date.now() > deadline) break;
    try {
      const cls = await classifyEmail(userId, toAiInput(e));
      await classifyStoredEmail(userId, e, cls, "ai");
      done++;
    } catch (err) {
      if (err instanceof AiUnavailableError) break;
      throw err;
    }
  }
  return done;
}

/** Emails held for review because the budget was used up get another AI try once it resets. */
export async function requeueBudgetHeld(userId: string): Promise<void> {
  const budget = await budgetStatus(userId);
  if (budget.state === "exceeded" || !budget.configured) return;
  await db
    .update(emails)
    .set({ classifiedBy: "pending", needsReview: false })
    .where(and(eq(emails.userId, userId), eq(emails.classifiedBy, "budget")));
}
