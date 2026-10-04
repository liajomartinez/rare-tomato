import { eq, isNotNull } from "drizzle-orm";
import { rewrapDataKey, unwrapDataKey, type MasterKeys } from "@/lib/crypto";
import type { Db } from "./client";
import { users } from "./schema";

// Master key change (ADR 0016, M6): re-wraps every person's data key under the NEW master key. The stored values themselves do not
// change, so this is quick. COUNTS ONLY: it never returns or prints a key or a value. Safe to run more than once, and safe to stop and
// re-run. The new key is masters.current; the old key must be masters.previous.

export interface RewrapReport {
  total: number;
  rewrapped: number;
  alreadyCurrent: number;
  failed: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (db: Db) => db as any;

function opensWith(key: Buffer, wrapped: string, userId: string): boolean {
  try {
    unwrapDataKey({ current: key }, wrapped, userId);
    return true;
  } catch {
    return false;
  }
}

export async function rewrapAllDataKeys(db: Db, masters: MasterKeys, opts: { dryRun?: boolean } = {}): Promise<RewrapReport> {
  const rows: { id: string; wrapped: string }[] = await q(db)
    .select({ id: users.id, wrapped: users.wrappedDataKey })
    .from(users)
    .where(isNotNull(users.wrappedDataKey));
  const report: RewrapReport = { total: rows.length, rewrapped: 0, alreadyCurrent: 0, failed: 0 };
  for (const row of rows) {
    if (opensWith(masters.current, row.wrapped, row.id)) {
      report.alreadyCurrent++;
      continue;
    }
    if (!masters.previous || !opensWith(masters.previous, row.wrapped, row.id)) {
      report.failed++;
      continue;
    }
    if (!opts.dryRun) {
      const next = rewrapDataKey(row.wrapped, row.id, masters.previous, masters.current);
      await q(db).update(users).set({ wrappedDataKey: next }).where(eq(users.id, row.id));
    }
    report.rewrapped++;
  }
  return report;
}

/** True only when EVERY person's data key opens with the new key alone (so the old key can be destroyed). */
export async function everyKeyOpensWithCurrentOnly(db: Db, current: Buffer): Promise<{ ok: boolean; total: number; failing: number }> {
  const rows: { id: string; wrapped: string }[] = await q(db)
    .select({ id: users.id, wrapped: users.wrappedDataKey })
    .from(users)
    .where(isNotNull(users.wrappedDataKey));
  const failing = rows.filter((r) => !opensWith(current, r.wrapped, r.id)).length;
  return { ok: failing === 0, total: rows.length, failing };
}
