import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import type { Db } from "./client";
import * as schema from "./schema";
import { safeDb } from "./safe";

/**
 * A throwaway in-memory Postgres with the real migrations applied. Used by tests so they never
 * touch a real database. Run from the project root (vitest does).
 */
export async function createTestDb(): Promise<Db> {
  // Optional real-world check: TEST_AGAINST_NEON=true runs the same tests on the Neon "test" branch
  // (its tables come from `db:migrate`). The default is the in-memory copy, which needs no secrets.
  if (process.env.TEST_AGAINST_NEON === "true") {
    const url = process.env.DATABASE_URL_TEST;
    if (!url) throw new Error("DATABASE_URL_TEST is not set");
    return safeDb(drizzleNeon(neon(url), { schema })) as unknown as Db;
  }
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
  // The same wrapper as production, so every test also exercises it.
  return safeDb(db) as unknown as Db;
}

export async function makeUser(db: Db, label: string) {
  const [user] = await db
    .insert(schema.users)
    .values({ authSubject: `user_test_${label}_${crypto.randomUUID()}`, email: `${label}@example.test` })
    .returning();
  return user;
}
