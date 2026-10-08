// Test configuration: in-memory database, throwaway secrets, no Anthropic key (AI calls are
// either mocked or must degrade gracefully).
process.env.DATABASE_URL ||= "pglite://memory";
process.env.BETTER_AUTH_SECRET ||= "test-secret-test-secret-test-secret-123";
process.env.OWNER_EMAIL ||= "owner@example.com";
process.env.ENCRYPTION_KEY ||= "0".repeat(63) + "1";
process.env.CRON_SECRET ||= "test-cron-secret-1234";
process.env.AI_MONTHLY_BUDGET_USD ||= "10";
delete process.env.ANTHROPIC_API_KEY;
