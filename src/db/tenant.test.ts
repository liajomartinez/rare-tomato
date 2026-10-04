import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { getTableColumns } from "drizzle-orm";
import type { Db } from "./client";
import * as schema from "./schema";
import { ownedTables, type OwnedTableName } from "./schema";
import { tenantDb, type Row, type TenantDb } from "./tenant";
import { createTestDb, makeUser } from "./testing";

// Tenant isolation (spec SEC-4): person A can never read, change, or delete person B's rows,
// on every table. A failure here blocks release.

async function makeTask(t: TenantDb, agentType: string) {
  const conn = await t.agentConnections.insert({ name: `Conn ${agentType}`, type: agentType });
  return t.tasks.insert({ agentConnectionId: conn.id, externalId: crypto.randomUUID(), summary: "did a thing", category: "other" });
}

const fixtures: Record<OwnedTableName, (t: TenantDb) => Promise<Row>> = {
  agentConnections: (t) => t.agentConnections.insert({ name: "Marge", type: "claude" }),
  profileFacts: (t) => t.profileFacts.insert({ category: "preferences", tier: 1, key: "tone", valueEncrypted: "x", source: "manual" }),
  tasks: (t) => makeTask(t, "chatgpt"),
  feedback: async (t) => {
    const task = await makeTask(t, "grok");
    return t.feedback.insert({ taskId: task.id, rating: "down" });
  },
  rules: (t) => t.rules.insert({ text: "Ask first.", category: "messaging", structured: {}, status: "proposed" }),
  adherenceChecks: async (t) => {
    const task = await makeTask(t, "muse");
    const rule = await t.rules.insert({ text: "Ask first.", category: "messaging", structured: {}, status: "active" });
    return t.adherenceChecks.insert({ taskId: task.id, ruleId: rule.id, verdict: "followed", scorer: "jev" });
  },
  careSnapshots: (t) => t.careSnapshots.insert({ date: "2026-09-29" }),
  usageCounters: (t) => t.usageCounters.insert({ month: "2026-09" }),
  auditLog: (t) => t.auditLog.insert({ actor: "agent", action: "read" }),
  consents: (t) => t.consents.insert({ type: "terms" }),
  jobs: (t) => t.jobs.insert({ type: "score" }),
};

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("coverage", () => {
  it("every table with a user_id column is in the tenant layer", () => {
    const withUserId = Object.entries(schema)
      .filter(([, v]) => v && typeof v === "object" && Symbol.for("drizzle:Name") in (v as object))
      .filter(([, v]) => "userId" in getTableColumns(v as never))
      .map(([k]) => k)
      .sort();
    expect(withUserId).toEqual(Object.keys(ownedTables).sort());
  });

  it("every owned table has a test fixture", () => {
    expect(Object.keys(fixtures).sort()).toEqual(Object.keys(ownedTables).sort());
  });
});

describe.each(Object.keys(ownedTables) as OwnedTableName[])("tenant isolation: %s", (name) => {
  it("person A cannot read, change, or delete person B's rows", async () => {
    const a = tenantDb(db, (await makeUser(db, "a")).id);
    const b = tenantDb(db, (await makeUser(db, "b")).id);
    const rowA = await fixtures[name](a);
    const rowB = await fixtures[name](b);
    const idB = rowB.id as string;

    expect((await a[name].list()).map((r) => r.id)).toContain(rowA.id);
    expect((await a[name].list()).map((r) => r.id)).not.toContain(idB);
    expect((await b[name].list()).map((r) => r.id)).not.toContain(rowA.id);

    expect(await a[name].get(idB)).toBeNull();
    expect(await a[name].update(idB, { updatedAt: new Date(0) })).toBeNull();
    expect(await a[name].softDelete(idB)).toBe(false);

    const stillThere = await b[name].get(idB);
    expect(stillThere).not.toBeNull();
    expect(stillThere?.deletedAt).toBeNull();
  });

  it("rows created by A are owned by A", async () => {
    const a = tenantDb(db, (await makeUser(db, "a2")).id);
    const b = tenantDb(db, (await makeUser(db, "b2")).id);
    const row = await fixtures[name](a);
    expect(row.userId).toBe(a.userId);
    expect((await b[name].list()).map((r) => r.id)).not.toContain(row.id);
  });

  it("a soft-deleted row disappears from reads", async () => {
    const a = tenantDb(db, (await makeUser(db, "a3")).id);
    const row = await fixtures[name](a);
    expect(await a[name].softDelete(row.id as string)).toBe(true);
    expect(await a[name].get(row.id as string)).toBeNull();
    expect((await a[name].list()).map((r) => r.id)).not.toContain(row.id);
  });
});

describe("owner and id cannot be smuggled in", () => {
  it("an owner in the inserted values is ignored", async () => {
    const a = tenantDb(db, (await makeUser(db, "sa")).id);
    const bUser = await makeUser(db, "sb");
    const row = await a.profileFacts.insert({
      userId: bUser.id, category: "preferences", tier: 1, key: "k", valueEncrypted: "x", source: "manual",
    });
    expect(row.userId).toBe(a.userId);
    expect(await tenantDb(db, bUser.id).profileFacts.list()).toEqual([]);
  });

  it("an update cannot move a row to another person or resurrect it", async () => {
    const a = tenantDb(db, (await makeUser(db, "sc")).id);
    const bUser = await makeUser(db, "sd");
    const row = await a.profileFacts.insert({ category: "preferences", tier: 1, key: "k", valueEncrypted: "x", source: "manual" });
    const updated = await a.profileFacts.update(row.id as string, { userId: bUser.id, key: "renamed" });
    expect(updated?.userId).toBe(a.userId);
    expect(updated?.key).toBe("renamed");
    expect(await tenantDb(db, bUser.id).profileFacts.list()).toEqual([]);
  });
});

describe("find and usage counters stay inside one person", () => {
  it("find only returns this person's matching rows, and rejects unknown columns", async () => {
    const a = tenantDb(db, (await makeUser(db, "fa1")).id);
    const b = tenantDb(db, (await makeUser(db, "fb1")).id);
    await a.profileFacts.insert({ category: "preferences", tier: 1, key: "same", valueEncrypted: "v1.a.b.c", source: "manual" });
    await b.profileFacts.insert({ category: "preferences", tier: 1, key: "same", valueEncrypted: "v1.a.b.c", source: "manual" });
    expect(await a.profileFacts.find({ key: "same" })).toHaveLength(1);
    expect((await a.profileFacts.find({ key: "same" }))[0].userId).toBe(a.userId);
    await expect(a.profileFacts.find({ nonsense: 1 })).rejects.toThrow(/Unknown column/);
  });

  it("usage counters count per person and per month", async () => {
    const a = tenantDb(db, (await makeUser(db, "ua")).id);
    const b = tenantDb(db, (await makeUser(db, "ub")).id);
    expect(await a.incrementUsage("2026-10", "taskLogs")).toBe(1);
    expect(await a.incrementUsage("2026-10", "taskLogs")).toBe(2);
    expect(await a.incrementUsage("2026-11", "taskLogs")).toBe(1);
    expect((await a.usage("2026-10")).taskLogs).toBe(2);
    expect((await b.usage("2026-10")).taskLogs).toBe(0);
  });
});

describe("cross-tenant references are refused by the database", () => {
  it("a task cannot point at another person's connection", async () => {
    const a = tenantDb(db, (await makeUser(db, "fa")).id);
    const b = tenantDb(db, (await makeUser(db, "fb")).id);
    const connB = await b.agentConnections.insert({ name: "B's agent", type: "claude" });
    await expect(
      a.tasks.insert({ agentConnectionId: connB.id, externalId: "x1", summary: "s", category: "other" }),
    ).rejects.toThrow();
  });

  it("feedback cannot point at another person's task", async () => {
    const a = tenantDb(db, (await makeUser(db, "fc")).id);
    const b = tenantDb(db, (await makeUser(db, "fd")).id);
    const taskB = await makeTask(b, "claude");
    await expect(a.feedback.insert({ taskId: taskB.id, rating: "down" })).rejects.toThrow();
  });
});

describe("the raw database is only used inside the data layer", () => {
  const allowed = [path.join("src", "db"), path.join("src", "lib", "identity.ts")];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = path.join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx|mts)$/.test(p)) files.push(p);
    }
  };

  it("no other code imports the raw database client or the Drizzle drivers", () => {
    walk("src");
    const offenders = files.filter((f) => {
      if (allowed.some((a) => f.startsWith(a))) return false;
      if (/\.test\.(ts|tsx)$/.test(f)) return false;
      // A type-only import cannot open a database, so it is fine.
      const text = readFileSync(f, "utf8").replace(/import type[^;]*;/g, "");
      return /db\/client|drizzle-orm\/(neon-http|pglite|node-postgres)|@neondatabase\/serverless/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});
