import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { createTestDb, makeUser } from "@/db/testing";
import { eq } from "drizzle-orm";
import { tenantDb } from "@/db/tenant";
import { getDataKey } from "./identity";
import { FACT_CAP, profileService, TIER } from "./profile";

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

async function person(label: string) {
  const user = await makeUser(db, label);
  return { user, svc: profileService(db, masters, user.id), t: tenantDb(db, user.id) };
}
const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("adding, reading, editing, deleting (FR-B1)", () => {
  it("round-trips a fact and sets the tier from the category", async () => {
    const { svc } = await person("crud");
    const { fact } = ok(await svc.add({ category: "family", key: "Theo", value: "Needs 15 minutes of notice before leaving" }));
    expect(fact.tier).toBe(TIER.family);
    expect(fact.source).toBe("manual");
    expect(fact.lastReviewedAt).not.toBeNull();
    expect((await svc.get(fact.id))?.value).toBe("Needs 15 minutes of notice before leaving");
    expect(await svc.list()).toHaveLength(1);
  });

  it("filters by category", async () => {
    const { svc } = await person("filter");
    ok(await svc.add({ category: "preferences", key: "Tone", value: "Casual with friends" }));
    ok(await svc.add({ category: "family", key: "Mia", value: "Soccer on Tuesdays" }));
    expect((await svc.list(["family"])).map((f) => f.key)).toEqual(["Mia"]);
  });

  it("editing changes the value, keeps a valid tier, and re-checks the text", async () => {
    const { svc } = await person("edit");
    const { fact } = ok(await svc.add({ category: "contacts", key: "Dentist", value: "Front desk (555) 010-1234" }));
    const edited = ok(await svc.update(fact.id, { category: "contacts", key: "Dentist", value: "Front desk, ask for Priya" }));
    expect(edited.fact.value).toBe("Front desk, ask for Priya");
    expect(edited.fact.tier).toBe(TIER.contacts);
    const bad = await svc.update(fact.id, { category: "contacts", key: "Dentist", value: "my password is hunter2" });
    expect(bad).toMatchObject({ ok: false, reason: "rejected" });
    expect((await svc.get(fact.id))?.value).toBe("Front desk, ask for Priya");
  });

  it("the tier follows the category and cannot be set directly (the service takes no tier)", async () => {
    const { svc, t } = await person("tier");
    const { fact } = ok(await svc.add({ category: "family", key: "Theo", value: "Bedtime is 8" }));
    // There is no tier field in the input: it is always taken from the category.
    const edited = ok(await svc.update(fact.id, { category: "family", key: "Theo", value: "Bedtime is 8:30" }));
    expect(edited.fact.tier).toBe(3);
    const row = await t.profileFacts.get(fact.id);
    expect(row?.tier).toBe(3);
  });

  it("deleting removes it from every read", async () => {
    const { svc } = await person("delete");
    const { fact } = ok(await svc.add({ category: "preferences", key: "Tone", value: "Casual" }));
    expect(await svc.remove(fact.id)).toBe(true);
    expect(await svc.get(fact.id)).toBeNull();
    expect(await svc.list()).toEqual([]);
  });

  it("marking a fact reviewed updates its review time", async () => {
    const { svc } = await person("review");
    const { fact } = ok(await svc.add({ category: "preferences", key: "Tone", value: "Casual" }));
    await new Promise((r) => setTimeout(r, 15));
    expect(await svc.markReviewed(fact.id)).toBe(true);
    expect((await svc.get(fact.id))!.lastReviewedAt!.getTime()).toBeGreaterThan(fact.lastReviewedAt!.getTime());
  });

  it("records where a fact came from", async () => {
    const { svc } = await person("source");
    expect(ok(await svc.add({ category: "preferences", key: "Tone", value: "Casual", source: "correction" })).fact.source).toBe("correction");
  });
});

describe("encryption at rest (SEC-5)", () => {
  it("the stored value has no readable plaintext, and the person has a wrapped key", async () => {
    const { user, svc, t } = await person("enc");
    const { fact } = ok(await svc.add({ category: "family", key: "Mia", value: "Soccer on Tuesdays after school" }));
    const row = await t.profileFacts.get(fact.id);
    expect(String(row?.valueEncrypted)).not.toContain("Soccer");
    expect(String(row?.valueEncrypted).startsWith("v1.")).toBe(true);
    const [u] = await db.select().from(users).where(eq(users.id, user.id));
    expect(u.wrappedDataKey).toMatch(/^v1\./);
    expect(u.wrappedDataKey).not.toContain(Buffer.from(await getDataKey(db, user.id, masters)).toString("base64"));
  });

  it("each person has their own key", async () => {
    const a = await person("key-a");
    const b = await person("key-b");
    expect((await getDataKey(db, a.user.id, masters)).equals(await getDataKey(db, b.user.id, masters))).toBe(false);
  });

  it("the same key is used again on later calls, even when several start at once", async () => {
    const { user } = await person("key-race");
    const keys = await Promise.all([1, 2, 3, 4].map(() => getDataKey(db, user.id, masters)));
    for (const k of keys) expect(k.equals(keys[0])).toBe(true);
  });

  it("a stored value cannot be read under another person's identity", async () => {
    const a = await person("swap-a");
    const b = await person("swap-b");
    const { fact } = ok(await a.svc.add({ category: "family", key: "Mia", value: "Secret schedule" }));
    const row = await a.t.profileFacts.get(fact.id);
    // Move A's encrypted value into B's account: B's key and identity cannot open it.
    const moved = await b.t.profileFacts.insert({ category: "family", tier: 3, key: "x", valueEncrypted: row!.valueEncrypted, source: "manual" });
    await expect(b.svc.get(moved.id as string)).rejects.toThrow();
  });
});

describe("the blocked-data check on save (FR-B2)", () => {
  it("rejects ID, card, bank and password text, and stores nothing", async () => {
    const { svc } = await person("blocked");
    for (const value of ["SSN 123-45-6789", "card 4111 1111 1111 1111", "routing number 021000021", "my password is hunter2"]) {
      expect(await svc.add({ category: "contacts", key: "Note", value })).toMatchObject({ ok: false, reason: "rejected" });
    }
    expect(await svc.list()).toEqual([]);
  });

  it("checks the label as well as the details", async () => {
    const { svc } = await person("label");
    expect(await svc.add({ category: "contacts", key: "SSN 123-45-6789", value: "Sam" })).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("asks for confirmation on health or money words, and saves once confirmed", async () => {
    const { svc } = await person("warn");
    const first = await svc.add({ category: "family", key: "Theo", value: "Has asthma; give the inhaler at 3pm" });
    expect(first).toMatchObject({ ok: false, reason: "needs_confirmation" });
    expect(await svc.list()).toEqual([]);
    const confirmed = ok(await svc.add({ category: "family", key: "Theo", value: "Has asthma; give the inhaler at 3pm" }, { confirmedWarnings: true }));
    expect(confirmed.warnings.length).toBeGreaterThan(0);
    expect(await svc.list()).toHaveLength(1);
  });

  it("saves a plain household dietary preference without any warning", async () => {
    const { svc } = await person("diet");
    const r = ok(await svc.add({ category: "preferences", key: "Dairy", value: "Our household avoids dairy" }));
    expect(r.warnings).toEqual([]);
    ok(await svc.add({ category: "preferences", key: "Food", value: "Household is vegetarian" }));
    expect(await svc.list()).toHaveLength(2);
  });

  it("a confirmed health detail is saved with a Sensitive label, and an edit is re-labeled", async () => {
    const { svc } = await person("label-sensitive");
    const saved = ok(await svc.add({ category: "family", key: "Mia", value: "Has asthma; give the inhaler at 3pm" }, { confirmedWarnings: true }));
    expect(saved.fact.sensitive).toBe(true);
    expect((await svc.list())[0].sensitive).toBe(true);
    const edited = ok(await svc.update(saved.fact.id, { category: "family", key: "Mia", value: "Likes soccer on Tuesdays" }));
    expect(edited.fact.sensitive).toBe(false);
  });

  it("dietary needs and allergies save with no warning and no Sensitive label", async () => {
    const { svc } = await person("allergy-silent");
    const a = ok(await svc.add({ category: "family", key: "Thomas", value: "Thomas has a dairy allergy" }));
    expect(a.warnings).toEqual([]);
    expect(a.fact.sensitive).toBe(false);
    ok(await svc.add({ category: "preferences", key: "Food", value: "severe peanut allergy" }));
  });

  it("insurance IDs, record numbers and test results are rejected even when the person confirms", async () => {
    const { svc } = await person("records");
    for (const value of ["member ID 12345678", "MRN 0098765", "discharge summary attached"]) {
      expect(await svc.add({ category: "family", key: "Note", value }, { confirmedWarnings: true })).toMatchObject({ ok: false, reason: "rejected" });
    }
    expect(await svc.list()).toEqual([]);
  });

  it("a spending-limit rule-style detail saves with no warning", async () => {
    const { svc } = await person("spend");
    expect((ok(await svc.add({ category: "preferences", key: "Spending", value: "Ask me before spending over $50 on this card" }))).warnings).toEqual([]);
  });

  it("a confirmation never overrides a rejection", async () => {
    const { svc } = await person("noreject");
    expect(await svc.add({ category: "contacts", key: "Note", value: "SSN 123-45-6789" }, { confirmedWarnings: true })).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("refuses empty or oversize input", async () => {
    const { svc } = await person("invalid");
    expect(await svc.add({ category: "preferences", key: "", value: "x" })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await svc.add({ category: "preferences", key: "k", value: "x".repeat(1001) })).toMatchObject({ ok: false, reason: "invalid" });
  });
});

describe("limits and isolation", () => {
  it("stops at the free-beta cap with a friendly message", async () => {
    const { svc, t } = await person("cap");
    // Fill to the cap directly, then confirm the next add is refused.
    const key = await getDataKey(db, t.userId, masters);
    void key;
    for (let i = 0; i < FACT_CAP; i++) {
      await t.profileFacts.insert({ category: "preferences", tier: 1, key: `k${i}`, valueEncrypted: "v1.a.b.c", source: "manual" });
    }
    const over = await svc.add({ category: "preferences", key: "one more", value: "x" });
    expect(over).toMatchObject({ ok: false, reason: "cap_reached" });
    expect((over as { message: string }).message).toMatch(/limit/);
  });

  it("one person cannot read, edit, review or delete another's facts", async () => {
    const a = await person("iso-a");
    const b = await person("iso-b");
    const { fact } = ok(await a.svc.add({ category: "family", key: "Mia", value: "Soccer" }));
    expect(await b.svc.get(fact.id)).toBeNull();
    expect(await b.svc.list()).toEqual([]);
    expect(await b.svc.update(fact.id, { category: "family", key: "Mia", value: "Hacked" })).toMatchObject({ ok: false, reason: "not_found" });
    expect(await b.svc.markReviewed(fact.id)).toBe(false);
    expect(await b.svc.remove(fact.id)).toBe(false);
    expect((await a.svc.get(fact.id))?.value).toBe("Soccer");
  });
});
