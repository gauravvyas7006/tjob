// Try tjob without a Neon account: starts an embedded Postgres (PGlite, data in apps/web/.pglite)
// as a local Postgres server, applies migrations, then runs `next dev` against it.
// Production always uses DATABASE_URL (Neon).
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

// Let the OS pick a free port (fixed ports can fall in Windows' reserved ranges).
const freePort = () =>
  new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
const port = Number(process.env.TJOB_LOCAL_PG_PORT) || (await freePort());
const dataDir = process.env.TJOB_PGLITE_DIR || "./.pglite";

const pg = await PGlite.create(dataDir);
await migrate(drizzle({ client: pg }), { migrationsFolder: "./drizzle" });
const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`[tjob] local database ready on 127.0.0.1:${port} (${dataDir})`);

const env = {
  ...process.env,
  TJOB_PGLITE: "1",
  TJOB_LOCAL_PG_URL: `postgres://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
};
env.DATABASE_URL ||= "local://pglite";

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], { stdio: "inherit", env, shell: true });
const shutdown = async (code) => {
  await server.stop().catch(() => {});
  await pg.close().catch(() => {});
  process.exit(code ?? 0);
};
child.on("exit", (code) => shutdown(code));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
