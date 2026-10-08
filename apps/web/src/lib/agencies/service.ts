import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { AgencyStatus } from "@tjob/shared";
import { agencies, db } from "@/db";
import { SUGGESTED_AGENCIES } from "./suggested";

/** Adds the researched agencies the user doesn't have yet (matched by name). Returns how many were added. */
export async function addSuggestedAgencies(userId: string): Promise<number> {
  if (SUGGESTED_AGENCIES.length === 0) return 0;
  const rows = await db
    .insert(agencies)
    .values(SUGGESTED_AGENCIES.map((a) => ({ ...a, userId, origin: "suggested" as const })))
    .onConflictDoNothing()
    .returning({ id: agencies.id });
  return rows.length;
}

/** How many researched agencies aren't on the user's list (never added, or deleted since). */
export function missingSuggestionCount(names: string[]): number {
  const have = new Set(names);
  return SUGGESTED_AGENCIES.filter((a) => !have.has(a.name)).length;
}

/**
 * "Contacted" stamps today's date (the latest outreach). "In touch" keeps the first contact date.
 * Back to "To contact" clears it; "Not useful" leaves it as it was.
 */
export async function setAgencyStatus(userId: string, id: string, status: AgencyStatus): Promise<void> {
  const contactedAt =
    status === "to_contact"
      ? { contactedAt: null }
      : status === "contacted"
        ? { contactedAt: new Date() }
        : status === "in_touch"
          ? { contactedAt: sql`coalesce(${agencies.contactedAt}, now())` }
          : {};
  await db
    .update(agencies)
    .set({ status, ...contactedAt })
    .where(and(eq(agencies.userId, userId), eq(agencies.id, id)));
}

/** Adds https:// to a bare domain; leaves empty and full URLs alone. */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
