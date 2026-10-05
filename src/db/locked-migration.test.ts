import fs from "node:fs";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { rulesService } from "@/lib/rules";

// Owner decision 1 (2026-10-04): there is no locked rule state. Migration 0010 turns every locked rule into an active one and loses nothing.
// The test puts rules in the OLD state (the enum value still exists in the database), runs the real migration file, and checks every rule.

const MIGRATION = fs.readFileSync("drizzle/0010_locked_rules_become_active.sql", "utf8");
const run = (db: Db) => (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute(sql.raw(MIGRATION));

describe("migration 0010: locked rules become active", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });

  async function seed(label: string) {
    const user = await makeUser(db, label);
    const t = tenantDb(db, user.id);
    const make = (text: string, status: string) =>
      t.rules.insert({ text, category: "messaging", scope: "all", status, version: 1, structured: { when: "x", because: "b", strength: "always" }, approvedAt: status === "proposed" ? null : new Date(), approvedBy: status === "proposed" ? null : user.id });
    const id = async (text: string, status: string) => (await make(text, status)).id as string;
    return { user, t, locked1: await id("Never agree a price", "locked"), locked2: await id("Ask before sharing my address", "locked"), active: await id("Keep it short", "active"), proposed: await id("A draft", "proposed"), retired: await id("Old rule", "retired") };
  }

  it("is the next migration in the journal", () => {
    const journal = JSON.parse(fs.readFileSync("drizzle/meta/_journal.json", "utf8")) as { entries: { idx: number; tag: string }[] };
    expect(journal.entries.at(-1)).toMatchObject({ idx: 10, tag: "0010_locked_rules_become_active" });
  });

  it("turns every locked rule into an active one, and counts them", async () => {
    const s = await seed("mig-count");
    const before = ((await s.t.rules.list()) as { status: string }[]).filter((r) => r.status === "locked").length;
    expect(before).toBe(2);
    await run(db);
    const after = (await s.t.rules.list()) as { id: string; status: string; text: string }[];
    expect(after.filter((r) => r.status === "locked")).toHaveLength(0);
    expect(after.find((r) => r.id === s.locked1)?.status).toBe("active");
    expect(after.find((r) => r.id === s.locked2)?.status).toBe("active");
  });

  it("loses no rule data: the text, history and approval stay, and a note records that the rule used to be locked", async () => {
    const s = await seed("mig-data");
    await run(db);
    const row = (await s.t.rules.get(s.locked1)) as { text: string; version: number; approvedAt: Date | null; approvedBy: string | null; structured: Record<string, unknown>; deletedAt: Date | null };
    expect(row.text).toBe("Never agree a price");
    expect(row.version).toBe(1);
    expect(row.approvedAt).not.toBeNull();
    expect(row.approvedBy).toBe(s.user.id);
    expect(row.structured).toMatchObject({ when: "x", because: "b", strength: "always", was_locked: true });
    expect(row.deletedAt).toBeNull();
    // the total number of rules is unchanged
    expect((await s.t.rules.list()) as unknown[]).toHaveLength(5);
  });

  it("leaves active, proposed and retired rules exactly as they were", async () => {
    const s = await seed("mig-others");
    await run(db);
    const get = async (id: string) => (await s.t.rules.get(id)) as { status: string; structured: Record<string, unknown> };
    expect((await get(s.active)).status).toBe("active");
    expect((await get(s.proposed)).status).toBe("proposed");
    expect((await get(s.retired)).status).toBe("retired");
    for (const r of [s.active, s.proposed, s.retired]) expect((await get(r)).structured).not.toHaveProperty("was_locked");
  });

  it("is safe to run twice: nothing changes the second time", async () => {
    const s = await seed("mig-twice");
    await run(db);
    const first = JSON.stringify(((await s.t.rules.list()) as { id: string; status: string; structured: unknown }[]).map((r) => [r.id, r.status, r.structured]).sort());
    await run(db);
    const second = JSON.stringify(((await s.t.rules.list()) as { id: string; status: string; structured: unknown }[]).map((r) => [r.id, r.status, r.structured]).sort());
    expect(second).toBe(first);
  });

  it("after the migration a former locked rule is served to agents and listed as active", async () => {
    const s = await seed("mig-serve");
    await run(db);
    const svc = rulesService(db, s.user.id);
    expect((await svc.get(s.locked1))?.status).toBe("active");
    expect((await svc.list()).filter((r) => r.status === "active").map((r) => r.text).sort()).toEqual(["Ask before sharing my address", "Keep it short", "Never agree a price"].sort());
  });
});
