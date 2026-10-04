import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/lib/crypto";
import { getDataKey } from "@/lib/identity";
import { profileService } from "@/lib/profile";
import type { Db } from "./client";
import { everyKeyOpensWithCurrentOnly, rewrapAllDataKeys } from "./rewrap";
import { createTestDb, makeUser } from "./testing";

// The master-key change drill (ADR 0016): rotate, re-wrap, confirm the old key is no longer needed, and nothing stored changes.

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("master key change: re-wrapping every person's data key", () => {
  it("after the drill the new key alone opens everything, stored values are untouched, and the old key can go", async () => {
    const oldKey = randomBytes(32);
    const newKey = randomBytes(32);
    const people = [];
    for (const label of ["rw1", "rw2", "rw3"]) {
      const u = await makeUser(db, label);
      const svc = profileService(db, { current: oldKey }, u.id);
      const saved = await svc.add({ category: "preferences", key: "Tone", value: `Casual ${label}` });
      if (!saved.ok) throw new Error("setup");
      people.push({ u, svc });
    }
    await makeUser(db, "rw-nokey"); // a person with no key yet is simply skipped

    // 1. During the change the server holds both keys.
    const both = { current: newKey, previous: oldKey };
    const dry = await rewrapAllDataKeys(db, both, { dryRun: true });
    expect(dry.rewrapped).toBeGreaterThanOrEqual(3);
    expect(await everyKeyOpensWithCurrentOnly(db, newKey)).toMatchObject({ ok: false });

    // 2. Re-wrap. A second run changes nothing.
    const first = await rewrapAllDataKeys(db, both);
    expect(first.failed).toBe(0);
    expect(first.rewrapped).toBe(dry.rewrapped);
    const second = await rewrapAllDataKeys(db, both);
    expect(second.rewrapped).toBe(0);
    expect(second.alreadyCurrent).toBe(second.total);

    // 3. The new key alone now opens every key, and the stored values read back exactly as before.
    expect(await everyKeyOpensWithCurrentOnly(db, newKey)).toMatchObject({ ok: true, failing: 0 });
    for (const [i, p] of people.entries()) {
      const fresh = profileService(db, { current: newKey }, p.u.id);
      expect((await fresh.list())[0].value).toBe(`Casual rw${i + 1}`);
    }
  });

  it("without the old key, keys that are not yet re-wrapped are counted as failed and nothing is changed", async () => {
    const oldKey = randomBytes(32);
    const u = await makeUser(db, "rw-lost");
    await profileService(db, { current: oldKey }, u.id).add({ category: "preferences", key: "Tone", value: "x" });
    const report = await rewrapAllDataKeys(db, { current: randomBytes(32) });
    expect(report.failed).toBeGreaterThanOrEqual(1);
    expect((await profileService(db, { current: oldKey }, u.id).list())[0].value).toBe("x");
  });

  it("reports only counts: no key or value appears in the report", async () => {
    const report = await rewrapAllDataKeys(db, { current: randomBytes(32), previous: randomBytes(32) }, { dryRun: true });
    expect(Object.keys(report).sort()).toEqual(["alreadyCurrent", "failed", "rewrapped", "total"]);
  });

  it("a value encrypted before the change still reads after it (the person binding survives re-wrapping)", async () => {
    const u = await makeUser(db, "rw-aad");
    const k = randomBytes(32);
    const dk = await getDataKey(db, u.id, { current: k });
    const packed = encryptField(dk, "hello", u.id, "t");
    const n = randomBytes(32);
    await rewrapAllDataKeys(db, { current: n, previous: k });
    const dk2 = await getDataKey(db, u.id, { current: n });
    expect(decryptField(dk2, packed, u.id, "t")).toBe("hello");
  });
});
