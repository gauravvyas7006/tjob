import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is not set (Neon pooled connection string)"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().optional(),
  OWNER_EMAIL: z.string().email("OWNER_EMAIL must be the email you will sign up with"),
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY must be 64 hex characters (32 bytes)"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

/** Validated server env. Read lazily so `next build` works before secrets are configured. */
export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`tjob is missing configuration in apps/web/.env.local:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/** Names of required settings that are missing or invalid (never their values). */
export function missingEnv(): { name: string; problem: string }[] {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return [];
  return parsed.error.issues.map((i) => ({ name: String(i.path[0]), problem: i.message }));
}

export function appUrl(): string {
  const configured = process.env.BETTER_AUTH_URL;
  // On Vercel, a localhost address (copied over from .env.local) is never right: use the real one.
  const ignored = Boolean(process.env.VERCEL) && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(configured ?? "");
  if (configured && !ignored) return configured;
  return process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000";
}
