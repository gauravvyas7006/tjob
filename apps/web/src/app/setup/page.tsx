import Link from "next/link";
import { headers } from "next/headers";
import { CheckCircle2, XCircle } from "lucide-react";
import { missingEnv } from "@/lib/env";

export const metadata = { title: "Setup" };

const HELP: Record<string, string> = {
  DATABASE_URL: "Neon pooled connection string (Vercel → Storage → Neon, or neon.tech → Connect).",
  BETTER_AUTH_SECRET: "Any random string of 32+ characters.",
  OWNER_EMAIL: "The email you will sign up with. Only this email can create the account.",
  ENCRYPTION_KEY: "64 hex characters; encrypts your mailbox password.",
  CRON_SECRET: "Random string the scheduled sync sends to /api/sync.",
  BETTER_AUTH_URL: "Your site address, e.g. https://your-project.vercel.app",
  AI_MONTHLY_BUDGET_USD: "A positive number, e.g. 10.",
};

/** Shown when required settings are missing, so a fresh deploy explains itself instead of erroring. */
export default async function SetupPage() {
  await headers(); // always render on request: env can change between deploys
  const missing = missingEnv();
  const names = ["DATABASE_URL", "BETTER_AUTH_SECRET", "OWNER_EMAIL", "ENCRYPTION_KEY", "CRON_SECRET"];
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Finish setting up tjob</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {missing.length
          ? "Add the missing settings to apps/web/.env.local (local) or Vercel → Settings → Environment Variables, then redeploy. See apps/web/.env.example for how to generate each one."
          : "Everything required is set."}
      </p>
      <ul className="mt-6 grid gap-3">
        {[...new Set([...names, ...missing.map((m) => m.name)])].map((name) => {
          const problem = missing.find((m) => m.name === name);
          return (
            <li key={name} className="flex gap-3 rounded-lg border p-3 text-sm">
              {problem ? (
                <XCircle className="mt-0.5 size-4 shrink-0 text-critical" aria-label="Missing" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-good" aria-label="Set" />
              )}
              <div>
                <code className="font-medium">{name}</code>
                {problem && <div className="text-muted-foreground">{HELP[name] ?? problem.problem}</div>}
              </div>
            </li>
          );
        })}
      </ul>
      {!missing.length && (
        <Link href="/login" className="mt-6 inline-block underline">
          Continue to sign in
        </Link>
      )}
    </main>
  );
}
