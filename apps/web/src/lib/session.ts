import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { missingEnv } from "./env";

/** Data-access-layer session check (deduplicated per render). */
export const getSession = cache(async () => {
  // Read the request first: this marks the page dynamic before any env/DB access happens.
  const requestHeaders = await headers();
  if (missingEnv().length) redirect("/setup");
  return getAuth().api.getSession({ headers: requestHeaders });
});

/** For pages and Server Actions: the signed-in user, or a redirect to /login. */
export const requireUser = cache(async () => {
  const session = await getSession();
  if (!session) redirect("/login");
  return session.user;
});
