import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgDatabase } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { safeDb } from "./safe";

/** Any Drizzle Postgres database (Neon in production, an in-memory Postgres in tests). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let cached: Db | undefined;

/** The real database. Only src/db and the identity code may import this (see the tenant guard test). */
export function getDb(): Db {
  if (!cached) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    cached = safeDb(drizzle(neon(url), { schema })) as unknown as Db; // errors carry a short code only (see safe.ts)
  }
  return cached;
}
