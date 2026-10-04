import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { decryptField, encryptField, type MasterKeys } from "@/lib/crypto";
import { getDataKey } from "@/lib/identity";
import type { Db } from "./client";
import { tasks } from "./schema";

// Encrypts existing task summaries (spec 14.3: a migration that changes how data is encrypted also backfills existing rows).
// RULES OF THIS FILE:
//   - It reports COUNTS ONLY. It never logs, returns or stores readable summary text outside the row it is encrypting.
//   - It is RE-RUNNABLE: it only touches rows that have a readable summary and no encrypted one, so running it twice changes
//     nothing the second time, and a stopped run is finished by running it again.
//   - It checks each row before writing it: the new ciphertext is decrypted in memory and compared with the original.
//   - It does NOT erase the readable column. A separate, later clean-up migration does that, only after the counts match.
// It works across all people, so it lives in src/db, the only place allowed to do that.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (db: Db) => db as any;

export interface BackfillReport {
  /** Every row in the table, including soft-deleted ones. */
  total: number;
  /** Already had an encrypted summary before this run. */
  alreadyEncrypted: number;
  /** Encrypted by this run. */
  encryptedNow: number;
  /** Had no summary at all, so nothing to encrypt. */
  noSummary: number;
  /** Could not be encrypted or did not verify; left untouched. */
  failed: number;
  /** Rows that still have a readable summary and no encrypted one after this run (0 means done). */
  remainingPlain: number;
}

export interface BackfillOptions {
  batchSize?: number;
  /** Count what would change, and change nothing. */
  dryRun?: boolean;
}

const FIELD = "task.summary";

async function counts(db: Db) {
  const rows: { id: string; summary: string | null; summaryEncrypted: string | null }[] = await q(db)
    .select({ id: tasks.id, summary: tasks.summary, summaryEncrypted: tasks.summaryEncrypted })
    .from(tasks);
  return {
    total: rows.length,
    encrypted: rows.filter((r) => r.summaryEncrypted !== null).length,
    plainOnly: rows.filter((r) => r.summaryEncrypted === null && r.summary !== null).length,
    neither: rows.filter((r) => r.summaryEncrypted === null && r.summary === null).length,
  };
}

export async function backfillSummaries(db: Db, masters: MasterKeys, opts: BackfillOptions = {}): Promise<BackfillReport> {
  const batchSize = opts.batchSize ?? 50;
  const before = await counts(db);
  const report: BackfillReport = { total: before.total, alreadyEncrypted: before.encrypted, encryptedNow: 0, noSummary: before.neither, failed: 0, remainingPlain: before.plainOnly };
  if (opts.dryRun) return report;

  const keys = new Map<string, Buffer>();
  const failedIds = new Set<string>();
  for (;;) {
    // Always the next rows that still need work, so a re-run (or a crash and restart) simply carries on.
    const batch: { id: string; userId: string; summary: string }[] = await q(db)
      .select({ id: tasks.id, userId: tasks.userId, summary: tasks.summary })
      .from(tasks)
      .where(and(isNull(tasks.summaryEncrypted), isNotNull(tasks.summary)))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(batchSize + failedIds.size);
    const todo = batch.filter((r) => !failedIds.has(r.id)).slice(0, batchSize);
    if (todo.length === 0) break;

    for (const row of todo) {
      try {
        if (!keys.has(row.userId)) keys.set(row.userId, await getDataKey(db, row.userId, masters));
        const key = keys.get(row.userId)!;
        const sealed = encryptField(key, row.summary, row.userId, FIELD);
        if (decryptField(key, sealed, row.userId, FIELD) !== row.summary) throw new Error("did not verify"); // checked in memory only
        // Only if nobody encrypted it in the meantime. updated_at is left alone on purpose: this is not a user change.
        const changed: { id: string }[] = await q(db)
          .update(tasks)
          .set({ summaryEncrypted: sealed })
          .where(and(eq(tasks.id, row.id), isNull(tasks.summaryEncrypted)))
          .returning({ id: tasks.id });
        if (changed.length === 1) report.encryptedNow++;
      } catch {
        failedIds.add(row.id);
        report.failed++;
      }
    }
  }
  const after = await counts(db);
  report.remainingPlain = after.plainOnly;
  return report;
}

export interface SummaryCheck {
  total: number;
  /** Rows whose encrypted summary decrypts correctly. */
  encryptedAndReadable: number;
  /** Rows with an encrypted summary that does not decrypt (a real problem). */
  unreadable: number;
  /** Rows that have both forms but whose decrypted text differs from the readable one (a real problem). */
  mismatched: number;
  /** Rows still with only the readable summary. */
  plainOnly: number;
  noSummary: number;
  /** True only when every row with a summary is encrypted, readable, and matches. This is the condition for dropping the readable column. */
  readyToDropReadableColumn: boolean;
}

/** Read-only. Counts only. Used before the clean-up migration: the live counts must match the row count. */
export async function checkSummaryEncryption(db: Db, masters: MasterKeys): Promise<SummaryCheck> {
  const rows: { userId: string; summary: string | null; summaryEncrypted: string | null }[] = await q(db)
    .select({ userId: tasks.userId, summary: tasks.summary, summaryEncrypted: tasks.summaryEncrypted })
    .from(tasks);
  const keys = new Map<string, Buffer>();
  const out: SummaryCheck = { total: rows.length, encryptedAndReadable: 0, unreadable: 0, mismatched: 0, plainOnly: 0, noSummary: 0, readyToDropReadableColumn: false };
  for (const r of rows) {
    if (r.summaryEncrypted === null) {
      if (r.summary === null) out.noSummary++;
      else out.plainOnly++;
      continue;
    }
    try {
      if (!keys.has(r.userId)) keys.set(r.userId, await getDataKey(db, r.userId, masters));
      const text = decryptField(keys.get(r.userId)!, r.summaryEncrypted, r.userId, FIELD);
      if (r.summary !== null && r.summary !== text) out.mismatched++;
      else out.encryptedAndReadable++;
    } catch {
      out.unreadable++;
    }
  }
  out.readyToDropReadableColumn = out.plainOnly === 0 && out.unreadable === 0 && out.mismatched === 0;
  return out;
}

/**
 * ROLLBACK TOOL. Puts the readable summary back from the encrypted one, for rows written since the new code went live
 * (which have no readable copy), so that the previous code can read every row again. Re-runnable and counts only.
 */
export async function restorePlainSummaries(db: Db, masters: MasterKeys, opts: BackfillOptions = {}): Promise<{ restored: number; failed: number; remainingEncryptedOnly: number }> {
  const batchSize = opts.batchSize ?? 50;
  const keys = new Map<string, Buffer>();
  const failedIds = new Set<string>();
  let restored = 0;
  for (;;) {
    const batch: { id: string; userId: string; summaryEncrypted: string }[] = await q(db)
      .select({ id: tasks.id, userId: tasks.userId, summaryEncrypted: tasks.summaryEncrypted })
      .from(tasks)
      .where(and(isNull(tasks.summary), isNotNull(tasks.summaryEncrypted)))
      .orderBy(asc(tasks.createdAt), asc(tasks.id))
      .limit(batchSize + failedIds.size);
    const todo = batch.filter((r) => !failedIds.has(r.id)).slice(0, batchSize);
    if (todo.length === 0 || opts.dryRun) break;
    for (const row of todo) {
      try {
        if (!keys.has(row.userId)) keys.set(row.userId, await getDataKey(db, row.userId, masters));
        const text = decryptField(keys.get(row.userId)!, row.summaryEncrypted, row.userId, FIELD);
        const changed: { id: string }[] = await q(db).update(tasks).set({ summary: text }).where(and(eq(tasks.id, row.id), isNull(tasks.summary))).returning({ id: tasks.id });
        if (changed.length === 1) restored++;
      } catch {
        failedIds.add(row.id);
      }
    }
  }
  const left: { id: string }[] = await q(db).select({ id: tasks.id }).from(tasks).where(and(isNull(tasks.summary), isNotNull(tasks.summaryEncrypted)));
  return { restored, failed: failedIds.size, remainingEncryptedOnly: left.length };
}
