import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { hardDeleteAccount, hardDeleteFact, hardDeleteRule, hardDeleteTask, purgeSoftDeleted } from "@/db/purge";
import { ownedTables, users, type OwnedTableName } from "@/db/schema";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { exportAll } from "./data-export";
import { feedbackService } from "./feedback";
import { profileService } from "./profile";
import { tasksService } from "./tasks";

// Data controls (spec FR-H1 export, FR-H2 delete account, FR-H3 delete one thing), tested end to end on synthetic data.

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

const SUMMARY = "Booked the dentist for Tuesday at 2pm";
const DETAILS = "Called Dr. Rivera's office, left a voicemail";
const NOTE = "Please never book before ten";
const FACT = "Prefers text over calls";

async function fullPerson(label: string) {
  const user = await makeUser(db, label);
  const t = tenantDb(db, user.id);
  const conn = await t.agentConnections.insert({
    name: "Marge", type: "muse", linkConfirmedAt: new Date(), tokenHash: "hash-must-not-export", tokenPrefix: `rt_prefix_${label}`,
  });
  const profile = profileService(db, masters, user.id);
  await profile.add({ category: "preferences", key: "Contact", value: FACT });
  const logged = await tasksService(db, masters, user.id).logTask(conn.id as string, {
    externalId: "job-1", summary: SUMMARY, details: DETAILS, category: "booking", outcome: "completed",
  });
  if (!logged.ok) throw new Error("setup failed");
  const fb = await feedbackService(db, masters, user.id).submit({ taskId: logged.taskId, rating: "down", reasonCodes: ["wrong_time_or_date"], note: NOTE });
  if (!fb.ok) throw new Error("feedback setup failed");
  const rule = await t.rules.insert({ text: "Ask before booking before 10am.", category: "booking", structured: {}, status: "active" });
  await t.adherenceChecks.insert({ taskId: logged.taskId, ruleId: rule.id, verdict: "followed", scorer: "claude" });
  await t.careSnapshots.insert({ date: "2026-10-01" });
  await t.incrementUsage("2026-10", "taskLogs");
  await t.auditLog.insert({ agentConnectionId: conn.id, actor: "agent", action: "get_rules", categoriesRead: ["rules"] });
  await t.consents.insert({ type: "terms" });
  await t.jobs.insert({ type: "score" });
  return { user, t, taskId: logged.taskId, ruleId: rule.id as string, connId: conn.id as string };
}

const countAll = async (userId: string) => {
  const t = tenantDb(db, userId);
  const out: Record<string, number> = {};
  for (const name of Object.keys(ownedTables) as OwnedTableName[]) out[name] = (await t[name].list()).length;
  return out;
};

describe("export (FR-H1)", () => {
  it("includes every owned table, with readable text for the owner and no ciphertext", async () => {
    const p = await fullPerson("export");
    const doc = await exportAll(db, masters, p.user.id);
    expect(Object.keys(doc.tables).sort()).toEqual(Object.keys(ownedTables).sort());
    const text = JSON.stringify(doc);
    for (const readable of [SUMMARY, DETAILS, NOTE, FACT, "Ask before booking before 10am."]) expect(text).toContain(readable);
    expect(text).not.toMatch(/"v1\./); // an export can never ship ciphertext
    expect(text).not.toContain("Encrypted");
    expect(doc.tables.tasks[0].summary).toBe(SUMMARY);
    expect(doc.tables.tasks[0].details).toBe(DETAILS);
    expect(doc.tables.profileFacts[0].value).toBe(FACT);
    expect(doc.tables.feedback[0].note).toBe(NOTE);
    for (const name of Object.keys(ownedTables) as OwnedTableName[]) expect(doc.tables[name].length).toBeGreaterThan(0);
    expect(doc.account.email).toBe("export@example.test");
  });

  it("never exports token hashes, prefixes or the wrapped data key", async () => {
    const p = await fullPerson("secrets");
    const text = JSON.stringify(await exportAll(db, masters, p.user.id));
    expect(text).not.toContain("hash-must-not-export");
    expect(text).not.toContain("rt_prefix_");
    expect(text).not.toContain("wrappedDataKey");
  });

  it("holds only this person's rows", async () => {
    const a = await fullPerson("exp-a");
    const b = await fullPerson("exp-b");
    const text = JSON.stringify(await exportAll(db, masters, a.user.id));
    expect(text).not.toContain(b.user.id);
    expect(text).not.toContain(b.taskId);
    expect(text).not.toContain("exp-b@example.test");
  });

  it("leaves out rows the person already deleted", async () => {
    const p = await fullPerson("exp-del");
    await tenantDb(db, p.user.id).tasks.softDelete(p.taskId);
    const doc = await exportAll(db, masters, p.user.id);
    expect(doc.tables.tasks).toHaveLength(0);
  });
});

describe("delete one thing (FR-H3)", () => {
  it("deleting a task removes it, its feedback and its scoring, and nothing else", async () => {
    const p = await fullPerson("del-task");
    expect(await hardDeleteTask(db, p.user.id, p.taskId)).toBe(true);
    const c = await countAll(p.user.id);
    expect(c.tasks).toBe(0);
    expect(c.feedback).toBe(0);
    expect(c.adherenceChecks).toBe(0);
    expect(c.rules).toBe(1);
    expect(c.profileFacts).toBe(1);
  });

  it("deleting a rule removes it and its scoring; the task stays", async () => {
    const p = await fullPerson("del-rule");
    expect(await hardDeleteRule(db, p.user.id, p.ruleId)).toBe(true);
    const c = await countAll(p.user.id);
    expect(c.rules).toBe(0);
    expect(c.adherenceChecks).toBe(0);
    expect(c.tasks).toBe(1);
  });

  it("deleting a detail removes it for good", async () => {
    const p = await fullPerson("del-fact");
    const [fact] = (await tenantDb(db, p.user.id).profileFacts.list()) as { id: string }[];
    expect(await hardDeleteFact(db, p.user.id, fact.id)).toBe(true);
    expect((await countAll(p.user.id)).profileFacts).toBe(0);
  });

  it("cannot delete another person's task, rule or detail", async () => {
    const a = await fullPerson("own-a");
    const b = await fullPerson("own-b");
    const [bFact] = (await tenantDb(db, b.user.id).profileFacts.list()) as { id: string }[];
    expect(await hardDeleteTask(db, a.user.id, b.taskId)).toBe(false);
    expect(await hardDeleteRule(db, a.user.id, b.ruleId)).toBe(false);
    expect(await hardDeleteFact(db, a.user.id, bFact.id)).toBe(false);
    const c = await countAll(b.user.id);
    expect(c.tasks).toBe(1);
    expect(c.rules).toBe(1);
    expect(c.profileFacts).toBe(1);
  });

  it("a deleted task never comes back in the feed", async () => {
    const p = await fullPerson("feed-gone");
    await hardDeleteTask(db, p.user.id, p.taskId);
    expect(await tasksService(db, masters, p.user.id).feed()).toEqual([]);
  });
});

describe("the purge job removes rows already marked deleted (FR-H2)", () => {
  it("hard-deletes soft-deleted rows with what points at them, and only for this person", async () => {
    const a = await fullPerson("purge-a");
    const b = await fullPerson("purge-b");
    await tenantDb(db, a.user.id).tasks.softDelete(a.taskId);
    await tenantDb(db, a.user.id).rules.softDelete(a.ruleId);
    await tenantDb(db, b.user.id).tasks.softDelete(b.taskId);
    const removed = await purgeSoftDeleted(db, a.user.id);
    expect(removed.tasks).toBe(1);
    expect(removed.rules).toBe(1);
    const raw = await db.select().from((await import("@/db/schema")).tasks);
    expect(raw.filter((r) => r.userId === a.user.id)).toHaveLength(0);
    expect(raw.filter((r) => r.userId === b.user.id)).toHaveLength(1); // B's soft-deleted row is untouched by A's purge
    expect((await countAll(a.user.id)).feedback).toBe(0);
  });
});

describe("delete account (FR-H2)", () => {
  it("leaves zero rows for the person in every table, soft-deleted ones included, and the account row is gone", async () => {
    const p = await fullPerson("acct");
    await tenantDb(db, p.user.id).tasks.softDelete(p.taskId); // a soft-deleted row must go too
    await hardDeleteAccount(db, p.user.id);
    const c = await countAll(p.user.id);
    for (const name of Object.keys(ownedTables) as OwnedTableName[]) expect(c[name]).toBe(0);
    const raw = await import("@/db/schema");
    for (const name of Object.keys(ownedTables) as OwnedTableName[]) {
      const table = ownedTables[name] as unknown as { userId: never };
      const rows = await db.select().from(ownedTables[name] as never).where(eq(table.userId, p.user.id));
      expect(rows, `${name} still has rows`).toHaveLength(0);
    }
    expect(await db.select().from(raw.users).where(eq(users.id, p.user.id))).toHaveLength(0);
  });

  it("leaves every other person's data exactly as it was", async () => {
    const a = await fullPerson("keep-a");
    const b = await fullPerson("keep-b");
    const before = await countAll(b.user.id);
    await hardDeleteAccount(db, a.user.id);
    expect(await countAll(b.user.id)).toEqual(before);
    expect((await exportAll(db, masters, b.user.id)).tables.tasks[0].summary).toBe(SUMMARY);
  });

  it("is safe to run twice", async () => {
    const p = await fullPerson("twice");
    await hardDeleteAccount(db, p.user.id);
    await expect(hardDeleteAccount(db, p.user.id)).resolves.toBeDefined();
  });
});
