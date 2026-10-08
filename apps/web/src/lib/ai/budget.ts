import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import type { AiFeature } from "@tjob/shared";
import { aiUsage, db } from "@/db";
import { env } from "@/lib/env";
import { costUsd, type TokenUsage } from "./pricing";

export class AiUnavailableError extends Error {
  constructor(public reason: "no_key" | "budget") {
    super(
      reason === "no_key"
        ? "AI is not configured: add ANTHROPIC_API_KEY to the environment."
        : "This month's AI budget is used up. AI features resume next month (or raise AI_MONTHLY_BUDGET_USD).",
    );
    this.name = "AiUnavailableError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthSpendUsd(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthStart())));
  return Number(row?.total ?? 0);
}

export interface BudgetStatus {
  configured: boolean;
  spentUsd: number;
  budgetUsd: number;
  /** 0-1+ */
  fraction: number;
  state: "ok" | "warn" | "exceeded";
}

export async function budgetStatus(userId: string): Promise<BudgetStatus> {
  const budgetUsd = env().AI_MONTHLY_BUDGET_USD;
  const spentUsd = await monthSpendUsd(userId);
  const fraction = budgetUsd > 0 ? spentUsd / budgetUsd : 1;
  return {
    configured: isAiConfigured(),
    spentUsd,
    budgetUsd,
    fraction,
    state: fraction >= 1 ? "exceeded" : fraction >= 0.8 ? "warn" : "ok",
  };
}

/** Throws AiUnavailableError when there's no API key or the monthly budget is spent. */
export async function assertAiAvailable(userId: string): Promise<void> {
  if (!isAiConfigured()) throw new AiUnavailableError("no_key");
  if ((await monthSpendUsd(userId)) >= env().AI_MONTHLY_BUDGET_USD) {
    throw new AiUnavailableError("budget");
  }
}

export async function recordUsage(
  userId: string,
  feature: AiFeature,
  model: string,
  usage: TokenUsage,
  batch = false,
): Promise<number> {
  const cost = costUsd(model, usage, batch);
  await db.insert(aiUsage).values({
    userId,
    feature,
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    batch,
    costUsd: cost,
  });
  return cost;
}

export async function usageByFeature(userId: string) {
  return db
    .select({
      feature: aiUsage.feature,
      calls: sql<number>`count(*)::int`,
      costUsd: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.cacheReadTokens} + ${aiUsage.cacheWriteTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsage.outputTokens}), 0)::int`,
    })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gte(aiUsage.createdAt, monthStart())))
    .groupBy(aiUsage.feature);
}
