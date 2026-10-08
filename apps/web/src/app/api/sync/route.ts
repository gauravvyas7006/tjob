import { after } from "next/server";
import { isCronRequest, unauthorized, userIdFromRequest } from "@/lib/api-auth";
import { EVENTS_REFRESH_MS, refreshEvents } from "@/lib/events/service";
import { runSync } from "@/lib/sync";

export const maxDuration = 300;

/**
 * Vercel's free plan only allows daily crons, so the Events list rides on the scheduled sync:
 * after each scheduled run, re-read the event listings if they're over 12 hours old.
 */
function refreshEventsLater() {
  after(() => refreshEvents({ ifOlderThanMs: EVENTS_REFRESH_MS }).catch((err) => console.error("events refresh", err)));
}

/** Vercel Cron (daily backup) calls GET with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return unauthorized();
  refreshEventsLater();
  return Response.json(await runSync());
}

/**
 * GitHub Actions (every 30 min, CRON_SECRET → all mailboxes) or the signed-in user's
 * "Sync now" button / dashboard auto-sync (their mailbox only, shorter time budget).
 */
export async function POST(request: Request) {
  if (isCronRequest(request)) {
    refreshEventsLater();
    return Response.json(await runSync());
  }
  const userId = await userIdFromRequest(request);
  if (!userId) return unauthorized();
  return Response.json(await runSync({ userId, budgetMs: 100_000 }));
}
