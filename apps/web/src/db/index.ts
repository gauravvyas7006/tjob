import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";
import { env } from "@/lib/env";

type Db = NeonHttpDatabase<typeof schema>;

let instance: Db | null = null;

function getDb(): Db {
  if (!instance) instance = drizzle({ client: neon(env().DATABASE_URL), schema });
  return instance;
}

/**
 * Neon over HTTP: one round-trip per query, no connection pool to manage on Vercel.
 * Interactive transactions aren't available; use `db.batch([...])` for atomic multi-statement writes.
 * The proxy defers connecting until first use so builds work without DATABASE_URL.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
