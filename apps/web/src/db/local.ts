/**
 * `npm run dev:local` database: a local Postgres-protocol server (embedded PGlite started by
 * scripts/dev-local.mjs) reached with node-postgres. Lets you try tjob before creating a Neon
 * database. Never used in production (next.config.ts only aliases it when TJOB_PGLITE=1).
 */
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const g = globalThis as typeof globalThis & { __tjobLocalPool?: Pool };
g.__tjobLocalPool ??= new Pool({ connectionString: process.env.TJOB_LOCAL_PG_URL, max: 4 });

// Same query API as the Neon driver for everything tjob uses.
export const db = drizzle({ client: g.__tjobLocalPool, schema }) as unknown as NeonHttpDatabase<typeof schema>;

export * from "./schema";
