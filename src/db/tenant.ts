import { and, desc, eq, getTableColumns, gte, inArray, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import { auditLog, ownedTables, usageCounters, type OwnedTableName } from "./schema";

// The one door to person-owned data (spec SEC-4 and NFR-6).
// Every read and write below is filtered by the person's id and skips soft-deleted rows.
// Code outside src/db must use tenantDb(); a test fails if it imports the raw database instead.

export type Row = Record<string, unknown>;

interface OwnedColumns {
  id: PgColumn;
  userId: PgColumn;
  deletedAt: PgColumn;
}

const FORBIDDEN_PATCH_KEYS = ["id", "userId", "createdAt", "deletedAt"];

function repo(db: Db, table: PgTable, userId: string) {
  const t = table as PgTable & OwnedColumns;
  const mine = and(eq(t.userId, userId), isNull(t.deletedAt));
  // The query builders are typed per table; this shared code works on any owned table.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = db as any;
  return {
    async list(): Promise<Row[]> {
      return q.select().from(t).where(mine);
    },
    /** Rows that match every given column value, still limited to this person and to rows not deleted. */
    async find(match: Row): Promise<Row[]> {
      const columns = getTableColumns(t) as unknown as Record<string, PgColumn>;
      const conditions = Object.entries(match).map(([key, value]) => {
        if (!columns[key]) throw new Error(`Unknown column: ${key}`);
        return eq(columns[key], value as never);
      });
      return q.select().from(t).where(and(mine, ...conditions));
    },
    async get(id: string): Promise<Row | null> {
      const rows: Row[] = await q.select().from(t).where(and(mine, eq(t.id, id))).limit(1);
      return rows[0] ?? null;
    },
    /** The owner is always set from the caller's id; a user_id in `values` is ignored. */
    async insert(values: Row): Promise<Row> {
      const rows: Row[] = await q.insert(t).values({ ...values, userId }).returning();
      return rows[0];
    },
    async update(id: string, patch: Row): Promise<Row | null> {
      const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => !FORBIDDEN_PATCH_KEYS.includes(k)));
      const rows: Row[] = await q.update(t).set({ ...clean, updatedAt: new Date() }).where(and(mine, eq(t.id, id))).returning();
      return rows[0] ?? null;
    },
    /** Soft delete: the row disappears from every read here; a purge job removes it for good. */
    async softDelete(id: string): Promise<boolean> {
      const rows: Row[] = await q.update(t).set({ deletedAt: new Date() }).where(and(mine, eq(t.id, id))).returning();
      return rows.length === 1;
    },
  };
}

export type Repo = ReturnType<typeof repo>;
export type UsageField = "taskLogs" | "proposals";
export type TenantDb = {
  userId: string;
  /** Adds one to this person's counter for the month and returns the new total (used for the caps). */
  incrementUsage(month: string, field: UsageField): Promise<number>;
  /** Adds an estimated model cost in US dollars to this person's month, under the provider's name. Never stores any text. */
  addModelCost(month: string, provider: string, usd: number): Promise<void>;
  /** This person's counters for the month (zeros if none yet). */
  usage(month: string): Promise<{ taskLogs: number; proposals: number }>;
  /** The newest audit rows, newest first, limited in the database (never loads the whole log). */
  recentAudit(limit: number): Promise<Row[]>;
  /** How many audit rows this connection has written since a time (for the per-connection rate limit). */
  auditCountSince(connectionId: string, since: Date): Promise<number>;
  /** The newest time of each wanted action, per connection, worked out in the database. */
  latestAuditByConnection(actions: string[]): Promise<{ agentConnectionId: string; action: string; at: Date }[]>;
} & Record<OwnedTableName, Repo>;

export function tenantDb(db: Db, userId: string): TenantDb {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error("tenantDb needs a valid user id");
  const out: Partial<Record<OwnedTableName, Repo>> = {};
  for (const name of Object.keys(ownedTables) as OwnedTableName[]) {
    out[name] = repo(db, ownedTables[name] as unknown as PgTable, userId);
  }
  const q = db as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  return {
    userId,
    ...(out as Record<OwnedTableName, Repo>),
    async incrementUsage(month, field) {
      const rows = await q
        .insert(usageCounters)
        .values({ userId, month, [field]: 1 })
        .onConflictDoUpdate({
          target: [usageCounters.userId, usageCounters.month],
          set: { [field]: sql`${usageCounters[field]} + 1`, updatedAt: new Date() },
        })
        .returning();
      return rows[0][field] as number;
    },
    async addModelCost(month, provider, usd) {
      const add = sql`jsonb_build_object(${provider}::text, coalesce((${usageCounters.modelCostUsdByProvider}->>${provider}::text)::numeric, 0) + ${usd}::numeric)`;
      await q
        .insert(usageCounters)
        .values({ userId, month, modelCostUsdByProvider: { [provider]: usd } })
        .onConflictDoUpdate({
          target: [usageCounters.userId, usageCounters.month],
          set: { modelCostUsdByProvider: sql`${usageCounters.modelCostUsdByProvider} || ${add}`, updatedAt: new Date() },
        });
    },
    async recentAudit(limit) {
      const n = Math.max(1, Math.min(5000, Math.floor(limit)));
      return q.select().from(auditLog).where(and(eq(auditLog.userId, userId), isNull(auditLog.deletedAt))).orderBy(desc(auditLog.at)).limit(n);
    },
    async auditCountSince(connectionId, since) {
      const rows = await q
        .select({ n: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(and(eq(auditLog.userId, userId), eq(auditLog.agentConnectionId, connectionId), gte(auditLog.at, since)));
      return Number(rows[0]?.n ?? 0);
    },
    async latestAuditByConnection(actions) {
      if (actions.length === 0) return [];
      const rows = await q
        .select({ agentConnectionId: auditLog.agentConnectionId, action: auditLog.action, at: sql<Date>`max(${auditLog.at})` })
        .from(auditLog)
        .where(and(eq(auditLog.userId, userId), isNull(auditLog.deletedAt), inArray(auditLog.action, actions)))
        .groupBy(auditLog.agentConnectionId, auditLog.action);
      return rows
        .filter((r: { agentConnectionId: string | null }) => r.agentConnectionId)
        .map((r: { agentConnectionId: string; action: string; at: Date | string }) => ({ agentConnectionId: r.agentConnectionId, action: r.action, at: new Date(r.at) }));
    },
    async usage(month) {
      const [row] = (await (out.usageCounters as Repo).find({ month })) as Row[];
      return { taskLogs: (row?.taskLogs as number) ?? 0, proposals: (row?.proposals as number) ?? 0 };
    },
  };
}
