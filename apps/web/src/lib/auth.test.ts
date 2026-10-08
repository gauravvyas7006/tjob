import { afterAll, describe, expect, it, vi } from "vitest";

describe("sign-in origin check", () => {
  afterAll(() => vi.unstubAllEnvs());

  // Takes about 20 s locally, too close to the 30 s default timeout.
  it("trusts the address the request was sent to, and rejects other sites", { timeout: 120_000 }, async () => {
    // Better Auth skips origin checks in test mode; make it behave as in production.
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TEST", "");
    // A wrong BETTER_AUTH_URL (e.g. copied from .env.local) must not lock you out.
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "");
    const { getAuth } = await import("./auth");
    const signIn = (origin: string) =>
      getAuth().handler(
        new Request("https://tjob.vercel.app/api/auth/sign-in/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin },
          body: JSON.stringify({ email: "nobody@example.com", password: "not-a-real-password" }),
        }),
      );

    // 401 = origin accepted, credentials checked (and wrong); 403 = origin rejected.
    expect((await signIn("https://tjob.vercel.app")).status).toBe(401);
    expect((await signIn("http://localhost:3000")).status).toBe(401);
    expect((await signIn("https://evil.example.com")).status).toBe(403);
  });
});
