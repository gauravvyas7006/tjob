import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { count } from "drizzle-orm";
import { authSchema, db, user } from "@/db";
import { appUrl, env } from "./env";

function createAuth() {
  const e = env();
  const origins = [appUrl()];
  if (process.env.VERCEL_URL) origins.push(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_BRANCH_URL) origins.push(`https://${process.env.VERCEL_BRANCH_URL}`);

  return betterAuth({
    secret: e.BETTER_AUTH_SECRET,
    baseURL: appUrl(),
    trustedOrigins: origins,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          // tjob is single-user: only OWNER_EMAIL may sign up, and only once.
          before: async (newUser) => {
            if (newUser.email.toLowerCase() !== e.OWNER_EMAIL.toLowerCase()) {
              throw new APIError("FORBIDDEN", {
                message: "Sign-up is limited to the owner of this tjob (OWNER_EMAIL).",
              });
            }
            const [{ n }] = await db.select({ n: count() }).from(user);
            if (n > 0) {
              throw new APIError("FORBIDDEN", { message: "An account already exists. Sign in instead." });
            }
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
let instance: Auth | null = null;

/** Created on first use so `next build` doesn't need secrets. */
export function getAuth(): Auth {
  if (!instance) instance = createAuth();
  return instance;
}
