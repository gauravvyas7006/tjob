import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { apiTokens, db } from "@/db";
import { getAuth } from "./auth";
import { safeEqual, sha256 } from "./crypto";
import { env } from "./env";

/**
 * Resolve the user for an API request: the browser session cookie, or an extension token
 * (`Authorization: Bearer tjob_...`). Returns null when neither is valid.
 */
export async function userIdFromRequest(request: Request): Promise<string | null> {
  const authz = request.headers.get("authorization") ?? "";
  if (authz.startsWith("Bearer tjob_")) {
    const hash = sha256(authz.slice("Bearer ".length).trim());
    const [row] = await db
      .select({ id: apiTokens.id, userId: apiTokens.userId })
      .from(apiTokens)
      .where(and(eq(apiTokens.tokenHash, hash), isNull(apiTokens.revokedAt)))
      .limit(1);
    if (!row) return null;
    await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.id));
    return row.userId;
  }
  const session = await getAuth().api.getSession({ headers: request.headers });
  return session?.user.id ?? null;
}

/** Scheduled sync callers (GitHub Actions, Vercel Cron) send `Authorization: Bearer $CRON_SECRET`. */
export function isCronRequest(request: Request): boolean {
  const authz = request.headers.get("authorization") ?? "";
  if (!authz.startsWith("Bearer ")) return false;
  return safeEqual(authz.slice("Bearer ".length).trim(), env().CRON_SECRET);
}

export function unauthorized() {
  return Response.json({ error: "Not signed in or invalid token" }, { status: 401 });
}

export function badRequest(message: string, details?: unknown) {
  return Response.json({ error: message, details }, { status: 400 });
}
