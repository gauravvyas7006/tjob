import { isCronRequest, unauthorized, userIdFromRequest } from "@/lib/api-auth";
import { runSync } from "@/lib/sync";

export const maxDuration = 300;

/** Vercel Cron (daily backup) calls GET with `Authorization: Bearer $CRON_SECRET`. */
export async function GET(request: Request) {
  if (!isCronRequest(request)) return unauthorized();
  return Response.json(await runSync());
}

/**
 * GitHub Actions (every 30 min, CRON_SECRET → all mailboxes) or the signed-in user's
 * "Sync now" button / dashboard auto-sync (their mailbox only, shorter time budget).
 */
export async function POST(request: Request) {
  if (isCronRequest(request)) return Response.json(await runSync());
  const userId = await userIdFromRequest(request);
  if (!userId) return unauthorized();
  return Response.json(await runSync({ userId, budgetMs: 100_000 }));
}
