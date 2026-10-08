import { afterEach, describe, expect, it, vi } from "vitest";
import { appUrl } from "./env";

describe("appUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses BETTER_AUTH_URL when it is set", () => {
    vi.stubEnv("BETTER_AUTH_URL", "https://jobs.example.com");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tjob.vercel.app");
    expect(appUrl()).toBe("https://jobs.example.com");
  });

  it("ignores a localhost BETTER_AUTH_URL on Vercel", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "tjob.vercel.app");
    expect(appUrl()).toBe("https://tjob.vercel.app");
  });

  it("keeps localhost when running locally", () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
    vi.stubEnv("VERCEL", "");
    expect(appUrl()).toBe("http://localhost:3000");
  });
});
