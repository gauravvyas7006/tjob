/**
 * Test database: in-memory embedded Postgres (PGlite) with the real migrations, so integration
 * tests exercise the same schema and SQL as production. Never used in production.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const client = new PGlite();
const local = drizzle({ client, schema });
await migrate(local, { migrationsFolder: "./drizzle" });

// Same query API as the Neon driver for everything tjob uses.
export const db = local as unknown as NeonHttpDatabase<typeof schema>;
export const pglite = client;

export * from "./schema";
