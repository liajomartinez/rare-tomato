import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { Db } from "./client";
import { systemFlags, usageCounters, users } from "./schema";

// Service-wide settings and totals that belong to no single person. This is the only place outside the tenant layer that
// reads across people, and it reads only counters and flags, never anyone's content.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (db: Db) => db as any;

export async function getFlag<T = unknown>(db: Db, key: string): Promise<T | undefined> {
  const rows = await q(db).select().from(systemFlags).where(eq(systemFlags.key, key)).limit(1);
  return rows[0]?.value as T | undefined;
}

export async function setFlag(db: Db, key: string, value: unknown): Promise<void> {
  await q(db)
    .insert(systemFlags)
    .values({ key, value })
    .onConflictDoUpdate({ target: systemFlags.key, set: { value, updatedAt: new Date() } });
}

/** Estimated model spend in US dollars, all providers, for one month: everyone together, or one person. */
export async function monthlyModelSpend(db: Db, month: string, userId?: string): Promise<number> {
  const rows: { cost: Record<string, number> }[] = await q(db)
    .select({ cost: usageCounters.modelCostUsdByProvider })
    .from(usageCounters)
    .where(userId ? sql`${usageCounters.month} = ${month} AND ${usageCounters.userId} = ${userId}` : eq(usageCounters.month, month));
  return rows.reduce((sum, r) => sum + Object.values(r.cost ?? {}).reduce((a, b) => a + Number(b), 0), 0);
}

// ---- Switches an operator can flip without a deploy (spec FR-J1). All live in the database. -----------------------------------

export const SIGNUPS_KEY = "signups_enabled";
export const JEV_KEY = "jev_calls_enabled";

/** New accounts are allowed unless someone has explicitly switched sign-ups off. */
export async function signupsOpen(db: Db): Promise<boolean> {
  return (await getFlag<boolean>(db, SIGNUPS_KEY)) !== false;
}

/** The Jev scorer is used unless someone has explicitly switched it off. */
export async function jevEnabled(db: Db): Promise<boolean> {
  return (await getFlag<boolean>(db, JEV_KEY)) !== false;
}

/** A per-person switch kept on the account (users.flags): for example modelCallsDisabled stops model calls for that person only. */
export async function personFlag(db: Db, userId: string, key: string): Promise<boolean> {
  const rows: { flags: Record<string, unknown> }[] = await q(db).select({ flags: users.flags }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.flags?.[key] === true;
}

export async function setPersonFlag(db: Db, userId: string, key: string, on: boolean): Promise<void> {
  const rows: { flags: Record<string, unknown> }[] = await q(db).select({ flags: users.flags }).from(users).where(eq(users.id, userId)).limit(1);
  if (!rows.length) return;
  await q(db).update(users).set({ flags: { ...rows[0].flags, [key]: on }, updatedAt: new Date() }).where(eq(users.id, userId));
}

/** Spend per person for one month, all providers (counts and dollars only; no content). For the operator summary. */
export async function spendByPerson(db: Db, month: string): Promise<{ userId: string; usd: number; proposals: number; taskLogs: number }[]> {
  const rows: { userId: string; cost: Record<string, number>; proposals: number; taskLogs: number }[] = await q(db)
    .select({ userId: usageCounters.userId, cost: usageCounters.modelCostUsdByProvider, proposals: usageCounters.proposals, taskLogs: usageCounters.taskLogs })
    .from(usageCounters)
    .where(eq(usageCounters.month, month));
  return rows.map((r) => ({ userId: r.userId, usd: Object.values(r.cost ?? {}).reduce((a, b) => a + Number(b), 0), proposals: r.proposals, taskLogs: r.taskLogs }));
}

// ---- Deleted accounts (FR-H2) ---------------------------------------------------------------------------------------------------
// When an account is deleted, its sign-in id is marked. A sign-in token or browser session that was issued before the deletion
// and is still valid must not quietly create a new account. The mark is removed only by a fresh sign-in (the /callback step),
// which is the person choosing to come back. The key is a hash of the sign-in id; the id itself is not kept.

const deletedKey = (authSubject: string) => `deleted_subject_${createHash("sha256").update(authSubject).digest("hex")}`;

export async function markSubjectDeleted(db: Db, authSubject: string): Promise<void> {
  await setFlag(db, deletedKey(authSubject), new Date().toISOString());
}
export async function isSubjectDeleted(db: Db, authSubject: string): Promise<boolean> {
  return (await getFlag<string>(db, deletedKey(authSubject))) !== undefined;
}
export async function clearDeletedMark(db: Db, authSubject: string): Promise<void> {
  await q(db).delete(systemFlags).where(eq(systemFlags.key, deletedKey(authSubject)));
}
