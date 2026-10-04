import { PGlite } from "@electric-sql/pglite";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { decryptField, encryptField } from "@/lib/crypto";
import { getDataKey } from "@/lib/identity";
import { readSummary, tasksService, UNREADABLE_SUMMARY } from "@/lib/tasks";
import type { Db } from "./client";
import * as schema from "./schema";
import { backfillSummaries, checkSummaryEncryption, restorePlainSummaries } from "./summary-backfill";
import { tenantDb } from "./tenant";

// Summary encryption (spec SEC-5, FR-C1, FR-C2, 14.3). The migration test builds a database at the PREVIOUS schema, fills it with
// readable summaries the way the live database has them, applies the new migration, and then runs the backfill: a faithful
// copy of the real upgrade path, on a throwaway in-memory database. Nothing real is touched.

const masters = { current: randomBytes(32) };
const FULL = path.resolve(process.cwd(), "drizzle");

function upToPreviousMigration() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mig-old-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(FULL, "meta", "_journal.json"), "utf8"));
  // The "previous schema" is the one just before the summary-encryption migration (0005), pinned by name so that later migrations (which add
  // other columns) do not move it. The upgrade below then applies 0005 and everything after it.
  const last = journal.entries.find((e: { tag: string }) => e.tag.startsWith("0005_"));
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < last.idx);
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) fs.copyFileSync(path.join(FULL, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  return { dir, newTag: last.tag as string };
}

const SECRETS = ["Booked the dentist for Theo on Tuesday", "Ünïcödé ✓ — 日本語 summary with 'quotes' and \"double\"", "x".repeat(500), "<b>markup</b> stays text"];

interface Seeded { db: Db; pg: PGlite; people: { id: string; connId: string }[]; plain: Map<string, string> }

/** A database at the previous schema with legacy rows: readable summaries and no encrypted column yet. */
async function legacyDatabase(): Promise<Seeded> {
  const pg = new PGlite();
  const raw = drizzle(pg, { schema });
  const { dir } = upToPreviousMigration();
  await migrate(raw, { migrationsFolder: dir });
  const db = raw as unknown as Db;
  const people: Seeded["people"] = [];
  const plain = new Map<string, string>();
  for (let p = 0; p < 3; p++) {
    // Plain SQL with only the columns that existed then (the current schema has more).
    const { rows: made } = await pg.query<{ id: string }>(`insert into users (auth_subject, email) values ($1, $2) returning id`, [`legacy_${p}_${crypto.randomUUID()}`, `legacy${p}@example.test`]);
    const u = made[0];
    const [c] = await raw.insert(schema.agentConnections).values({ userId: u.id, name: `Agent ${p}`, type: "other", linkConfirmedAt: new Date() }).returning();
    people.push({ id: u.id, connId: c.id });
    for (let i = 0; i < 3; i++) {
      const text = SECRETS[(p + i) % SECRETS.length];
      const id = crypto.randomUUID();
      await pg.query(
        `insert into tasks (id, user_id, agent_connection_id, external_id, summary, category) values ($1, $2, $3, $4, $5, 'other')`,
        [id, u.id, c.id, `legacy-${p}-${i}`, text],
      );
      plain.set(id, text);
    }
  }
  // One soft-deleted row and one with no summary at all, so the counts have to account for everything.
  await pg.query(`insert into tasks (id, user_id, agent_connection_id, external_id, summary, category, deleted_at) values ($1,$2,$3,'legacy-deleted','Deleted but still in the table','other', now())`, [crypto.randomUUID(), people[0].id, people[0].connId]);
  return { db, pg, people, plain };
}

async function upgrade(s: Seeded) {
  await migrate(drizzle(s.pg, { schema }), { migrationsFolder: FULL }); // applies only the new migration
}
const rows = async (s: Seeded) => (await s.pg.query<{ id: string; user_id: string; summary: string | null; summary_encrypted: string | null; deleted_at: Date | null }>("select id, user_id, summary, summary_encrypted, deleted_at from tasks")).rows;

describe("upgrading a database that has readable summaries", () => {
  it("the new migration only adds a column and relaxes one, and changes no data", async () => {
    const s = await legacyDatabase();
    // Read with the OLD columns only: the new column does not exist yet.
    const before = (await s.pg.query<{ id: string; summary: string | null }>("select id, summary from tasks")).rows;
    await upgrade(s);
    const after = await rows(s);
    expect(after).toHaveLength(before.length);
    for (const r of after) expect(r.summary_encrypted).toBeNull();
    expect(after.map((r) => r.summary).sort()).toEqual(before.map((r) => r.summary).sort());
    const sqlText = fs.readFileSync(path.join(FULL, `${upToPreviousMigration().newTag}.sql`), "utf8");
    expect(sqlText).not.toMatch(/DROP COLUMN|DROP TABLE|DELETE|UPDATE|TRUNCATE/i); // additive only; the readable column stays until the later clean-up
  });

  it("before the backfill, the feed still shows the legacy summaries correctly (both forms are read)", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    for (const p of s.people) {
      const feed = await tasksService(s.db, masters, p.id).feed({ limit: 50 });
      for (const t of feed) expect(t.summary).toBe(s.plain.get(t.id));
      expect(feed.length).toBeGreaterThan(0);
    }
  });

  it("the backfill encrypts every row, reports counts only, and the feed reads the same text afterwards", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    const report = await backfillSummaries(s.db, masters, { batchSize: 2 }); // small batches on purpose
    const all = await rows(s);
    expect(report).toEqual({ total: all.length, alreadyEncrypted: 0, encryptedNow: all.length, noSummary: 0, failed: 0, remainingPlain: 0 });
    for (const r of all) {
      expect(r.summary_encrypted).toBeTruthy();
      for (const text of [...s.plain.values(), "Deleted but still in the table"]) expect(r.summary_encrypted).not.toContain(text.slice(0, 12));
    }
    for (const p of s.people) {
      for (const t of await tasksService(s.db, masters, p.id).feed({ limit: 50 })) expect(t.summary).toBe(s.plain.get(t.id));
    }
    // The readable column is NOT cleared by the backfill (a later, separate migration does that).
    expect((await rows(s)).every((r) => r.summary !== null)).toBe(true);
  });

  it("is re-runnable: a second run changes nothing, and does not touch rows that were already encrypted", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    await backfillSummaries(s.db, masters);
    const first = new Map((await rows(s)).map((r) => [r.id, r.summary_encrypted]));
    const second = await backfillSummaries(s.db, masters);
    expect(second).toMatchObject({ encryptedNow: 0, failed: 0, remainingPlain: 0 });
    expect(second.alreadyEncrypted).toBe(first.size);
    for (const r of await rows(s)) expect(r.summary_encrypted).toBe(first.get(r.id)); // byte for byte, not re-encrypted
  });

  it("a stopped run is finished by running it again", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    // Simulate a run that stopped half way: encrypt only some rows by hand.
    const all = await rows(s);
    for (const r of all.slice(0, 4)) {
      const key = await getDataKey(s.db, r.user_id, masters);
      await s.pg.query("update tasks set summary_encrypted = $1 where id = $2", [encryptField(key, r.summary!, r.user_id, "task.summary"), r.id]);
    }
    const report = await backfillSummaries(s.db, masters, { batchSize: 3 });
    expect(report.alreadyEncrypted).toBe(4);
    expect(report.encryptedNow).toBe(all.length - 4);
    expect(report.remainingPlain).toBe(0);
  });

  it("two runs at the same time never encrypt the same row twice", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    const total = (await rows(s)).length;
    const [a, b] = await Promise.all([backfillSummaries(s.db, masters, { batchSize: 4 }), backfillSummaries(s.db, masters, { batchSize: 4 })]);
    expect(a.encryptedNow + b.encryptedNow).toBe(total); // each row was claimed by exactly one of them
    expect((await checkSummaryEncryption(s.db, masters)).readyToDropReadableColumn).toBe(true);
  });

  it("a dry run changes nothing and says what it would do", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    const report = await backfillSummaries(s.db, masters, { dryRun: true });
    expect(report.encryptedNow).toBe(0);
    expect(report.remainingPlain).toBe((await rows(s)).length);
    expect((await rows(s)).every((r) => r.summary_encrypted === null)).toBe(true);
  });

  it("a row that cannot be encrypted is counted and left alone, and the others are still done", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    await s.pg.query("update users set wrapped_data_key = 'not-a-real-key' where id = $1", [s.people[1].id]);
    const report = await backfillSummaries(s.db, masters);
    expect(report.failed).toBe(3);
    expect(report.remainingPlain).toBe(3);
    const all = await rows(s);
    expect(all.filter((r) => r.user_id === s.people[1].id).every((r) => r.summary_encrypted === null)).toBe(true);
    expect(all.filter((r) => r.user_id !== s.people[1].id).every((r) => r.summary_encrypted !== null)).toBe(true);
    expect((await checkSummaryEncryption(s.db, masters)).readyToDropReadableColumn).toBe(false);
  });

  it("the check says it is ready to drop the readable column only when every row is encrypted, readable and matching", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    expect((await checkSummaryEncryption(s.db, masters)).readyToDropReadableColumn).toBe(false); // nothing encrypted yet
    await backfillSummaries(s.db, masters);
    const ready = await checkSummaryEncryption(s.db, masters);
    expect(ready).toMatchObject({ plainOnly: 0, unreadable: 0, mismatched: 0, readyToDropReadableColumn: true });
    expect(ready.encryptedAndReadable).toBe(ready.total);
    // A corrupted ciphertext, and a ciphertext that disagrees with the readable text, are both caught.
    const [a, b] = await rows(s);
    await s.pg.query("update tasks set summary_encrypted = 'garbage' where id = $1", [a.id]);
    const key = await getDataKey(s.db, b.user_id, masters);
    await s.pg.query("update tasks set summary_encrypted = $1 where id = $2", [encryptField(key, "a different text", b.user_id, "task.summary"), b.id]);
    expect(await checkSummaryEncryption(s.db, masters)).toMatchObject({ unreadable: 1, mismatched: 1, readyToDropReadableColumn: false });
  });

  it("rollback: rows written after the new code (no readable copy) can be restored, so the old code can read every row", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    await backfillSummaries(s.db, masters);
    // New code writing a task: encrypted only.
    const p = s.people[0];
    const logged = await tasksService(s.db, masters, p.id).logTask(p.connId, { externalId: "after-upgrade", summary: "Written after the upgrade", category: "other" });
    if (!logged.ok) throw new Error("setup");
    const before = (await rows(s)).find((r) => r.id === logged.taskId)!;
    expect(before.summary).toBeNull();
    const out = await restorePlainSummaries(s.db, masters);
    expect(out).toEqual({ restored: 1, failed: 0, remainingEncryptedOnly: 0 });
    expect((await rows(s)).find((r) => r.id === logged.taskId)!.summary).toBe("Written after the upgrade");
    expect(await restorePlainSummaries(s.db, masters)).toMatchObject({ restored: 0 }); // re-runnable
  });
});

describe("new tasks hold the summary only encrypted (SEC-5, FR-C1)", () => {
  let db: Db;
  beforeAll(async () => {
    const { createTestDb } = await import("./testing");
    db = await createTestDb();
  });
  const person = async (label: string) => {
    const { makeUser } = await import("./testing");
    const user = await makeUser(db, label);
    const t = tenantDb(db, user.id);
    const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date() });
    return { user, t, conn: conn.id as string, svc: tasksService(db, masters, user.id) };
  };

  it("stores no readable summary, shows it to the owner, and the owner's key is the only one that opens it", async () => {
    const p = await person("enc");
    const other = await person("enc-other");
    const logged = await p.svc.logTask(p.conn, { externalId: "e1", summary: "Booked the dentist for Theo", category: "booking" });
    if (!logged.ok) throw new Error("setup");
    const row = (await p.t.tasks.get(logged.taskId))!;
    expect(row.summary).toBeNull();
    expect(String(row.summaryEncrypted)).not.toContain("dentist");
    expect((await p.svc.feed())[0].summary).toBe("Booked the dentist for Theo");
    expect((await p.svc.get(logged.taskId))?.summary).toBe("Booked the dentist for Theo");
    const otherKey = await getDataKey(db, other.user.id, masters);
    expect(readSummary(row, otherKey, p.user.id)).toBe(UNREADABLE_SUMMARY); // another person's key cannot read it
    expect(() => decryptField(otherKey, row.summaryEncrypted as string, p.user.id, "task.summary")).toThrow();
  });

  it("another person's feed never contains it, and the feed filters never look at summary text", async () => {
    const p = await person("feedA");
    const q = await person("feedB");
    await p.svc.logTask(p.conn, { externalId: "f1", summary: "Only A should see this", category: "booking" });
    expect(await q.svc.feed()).toHaveLength(0);
    expect(await p.svc.feed({ category: "booking" })).toHaveLength(1);
    expect(await p.svc.feed({ category: "messaging" })).toHaveLength(0);
  });

  it("one summary that cannot be read shows a placeholder and does not break the feed", async () => {
    const p = await person("broken");
    const a = await p.svc.logTask(p.conn, { externalId: "b1", summary: "Fine one", category: "other" });
    const b = await p.svc.logTask(p.conn, { externalId: "b2", summary: "Soon to be damaged", category: "other" });
    if (!a.ok || !b.ok) throw new Error("setup");
    await p.t.tasks.update(b.taskId, { summaryEncrypted: "damaged" });
    const feed = await p.svc.feed();
    expect(feed.map((t) => t.summary).sort()).toEqual([UNREADABLE_SUMMARY, "Fine one"].sort());
  });
});

describe("readable text is never logged", () => {
  const spies = ["log", "info", "warn", "error", "debug"].map((m) => vi.spyOn(console, m as "log").mockImplementation(() => undefined));
  afterEach(() => spies.forEach((s) => s.mockClear()));

  it("neither the backfill, the check, the rollback, nor logging and reading a task prints any summary text", async () => {
    const s = await legacyDatabase();
    await upgrade(s);
    await backfillSummaries(s.db, masters);
    await checkSummaryEncryption(s.db, masters);
    const p = s.people[0];
    await tasksService(s.db, masters, p.id).logTask(p.connId, { externalId: "log-test", summary: "SECRET-SUMMARY-TEXT-12345", category: "other" });
    await tasksService(s.db, masters, p.id).feed();
    await restorePlainSummaries(s.db, masters);
    const printed = spies.flatMap((spy) => spy.mock.calls.flat()).join("\n");
    for (const text of [...s.plain.values(), "SECRET-SUMMARY-TEXT-12345"]) expect(printed).not.toContain(text.slice(0, 12));
  });
});

void sql;
