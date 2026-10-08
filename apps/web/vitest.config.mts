import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // Integration tests run against an in-memory PGlite with the real migrations.
      "@/db": fileURLToPath(new URL("./src/db/pglite.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside React Server Components; tests run server code directly.
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    testTimeout: 30000,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
