import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb, makeUser } from "@/db/testing";
import { careSheet } from "./care-sheet";
import { profileService } from "./profile";
import { rulesService } from "./rules";

// FR-G2: a dated header, active rules and the chosen details, and nothing outside the chosen scopes.

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

const NOW = new Date("2026-10-03T12:00:00Z");

async function setup(label: string) {
  const user = await makeUser(db, label);
  const facts = profileService(db, masters, user.id);
  const add = async (category: "preferences" | "contacts" | "family", key: string, value: string, confirmed = false) => {
    const r = await facts.add({ category, key, value }, { confirmedWarnings: confirmed });
    if (!r.ok) throw new Error(JSON.stringify(r));
  };
  await add("preferences", "Tone", "Casual with friends");
  await add("contacts", "Dentist", "Front desk, ask for Priya");
  await add("family", "Mia", "Soccer on Tuesdays");
  await add("family", "Mia health", "Has asthma; give the inhaler at 3pm", true);
  const rules = rulesService(db, user.id);
  const mk = async (text: string, extra: Record<string, unknown> = {}) => {
    const r = await rules.propose({ text, category: "booking", when: "booking an appointment", because: "b", ...extra });
    if (!r.ok) throw new Error(JSON.stringify(r));
    return r.rule;
  };
  const active = await mk("Never book before 10 am.");
  await rules.approve(active.id);
  const locked = await mk("Ask before spending over $50.");
  await rules.approve(locked.id, { lock: true });
  await mk("A proposed rule nobody approved.");
  const retired = await mk("A retired rule.");
  await rules.approve(retired.id);
  await rules.retire(retired.id);
  const agentOnly = await mk("Only for one agent.", { scope: "agent:11111111-1111-1111-1111-111111111111" });
  await rules.approve(agentOnly.id);
  return user;
}

describe("the care sheet", () => {
  it("has a dated header and says it is a snapshot of the person's own requests", async () => {
    const u = await setup("cs-header");
    const sheet = await careSheet(db, masters, u.id, { categories: ["preferences"], now: NOW });
    expect(sheet.split("\n")[0]).toBe("# My care sheet (made 2026-10-03)");
    expect(sheet).toContain("snapshot");
    expect(sheet).toContain("tell me if you cannot follow one");
  });

  it("lists active and locked rules (locked first), and no proposed, retired or agent-specific rule", async () => {
    const u = await setup("cs-rules");
    const sheet = await careSheet(db, masters, u.id, { categories: [], now: NOW });
    expect(sheet).toContain("[locked] Ask before spending over $50.");
    expect(sheet).toContain("Never book before 10 am.");
    expect(sheet.indexOf("[locked]")).toBeLessThan(sheet.indexOf("Never book before 10 am."));
    expect(sheet).not.toContain("proposed rule nobody approved");
    expect(sheet).not.toContain("retired rule");
    expect(sheet).not.toContain("Only for one agent");
  });

  it("contains no detail outside the chosen categories", async () => {
    const u = await setup("cs-scope");
    const prefs = await careSheet(db, masters, u.id, { categories: ["preferences"], now: NOW });
    expect(prefs).toContain("Casual with friends");
    for (const hidden of ["Front desk", "Priya", "Soccer on Tuesdays", "asthma"]) expect(prefs).not.toContain(hidden);
    const none = await careSheet(db, masters, u.id, { categories: [], now: NOW });
    for (const hidden of ["Casual with friends", "Front desk", "Soccer", "asthma"]) expect(none).not.toContain(hidden);
    const family = await careSheet(db, masters, u.id, { categories: ["family"], now: NOW });
    expect(family).toContain("Soccer on Tuesdays");
    expect(family).not.toContain("Casual with friends");
  });

  it("leaves out Sensitive details unless the person asks for them, and then labels them", async () => {
    const u = await setup("cs-sensitive");
    const without = await careSheet(db, masters, u.id, { categories: ["family"], now: NOW });
    expect(without).not.toContain("asthma");
    const withIt = await careSheet(db, masters, u.id, { categories: ["family"], includeSensitive: true, now: NOW });
    expect(withIt).toContain("asthma");
    expect(withIt).toContain("(sensitive)");
  });

  it("never holds another person's rules or details", async () => {
    const a = await setup("cs-a");
    const b = await setup("cs-b");
    const sheet = await careSheet(db, masters, a.id, { categories: ["preferences", "contacts", "family"], now: NOW });
    expect(sheet.match(/Never book before 10 am\./g)).toHaveLength(1);
    expect(sheet.match(/Casual with friends/g)).toHaveLength(1);
    expect(b.id).not.toBe(a.id);
  });

  it("never says rules are enforced, followed or verified", async () => {
    const u = await setup("cs-copy");
    const sheet = await careSheet(db, masters, u.id, { categories: ["preferences"], now: NOW });
    expect(sheet).not.toMatch(/enforced|guarantee|verified|independent/i);
    expect(sheet).toMatch(/not something anyone can force/);
  });
});
