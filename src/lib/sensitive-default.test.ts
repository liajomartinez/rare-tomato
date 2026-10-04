import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { confirmConnection, resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { profileService } from "./profile";
import { makeServices } from "./services";
import { SENSITIVE_CARD_CHOICE, SENSITIVE_CARD_WHO, SENSITIVE_CONFIRM_LABEL } from "./strings";

// Run 10: a NEW detail labeled Sensitive starts as "Only the agents I choose" with no agent chosen. Details saved before are not changed.

const masters = { current: randomBytes(32) };
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup() {
  const sub = `user_sens_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  const t = tenantDb(db, user.id);
  const r = await resolveOAuthConnection(db, { authSubject: sub, clientId: `client-sens-${crypto.randomUUID().slice(0, 8)}0000000` });
  if (!r.ok) throw new Error("setup");
  await confirmConnection(t, r.connection.id, { type: "claude", name: "Claude" });
  return { user, t, conn: r.connection.id, profile: profileService(db, masters, user.id), services: makeServices(db, masters) };
}
const values = (facts: { value: string }[]) => facts.map((f) => f.value).sort();

describe("a new Sensitive detail starts limited, with nobody chosen", () => {
  it("is saved with an empty 'agents I choose' list, so a connected agent that holds the category's permission still gets nothing", async () => {
    const p = await setup();
    const saved = await p.profile.add({ category: "preferences", key: "Allergy", value: "Mia has asthma; give her the inhaler at 3pm" }, { confirmedWarnings: true });
    if (!saved.ok) throw new Error("setup");
    expect(saved.fact.sensitive).toBe(true);
    expect(saved.fact.allowedAgentIds).toEqual([]);
    expect(await p.services.facts(p.user.id, ["preferences"], p.conn)).toEqual([]);
  });

  it("starts serving it only after the person ticks an agent", async () => {
    const p = await setup();
    const saved = await p.profile.add({ category: "preferences", key: "Medication", value: "Insulin reminder at noon" }, { confirmedWarnings: true });
    if (!saved.ok) throw new Error("setup");
    expect(await p.profile.setVisibility(saved.fact.id, [p.conn])).toEqual({ ok: true });
    expect(values(await p.services.facts(p.user.id, ["preferences"], p.conn))).toEqual(["Insulin reminder at noon"]);
  });

  it("does not change an ordinary detail: it keeps the category default and is served as before", async () => {
    const p = await setup();
    const saved = await p.profile.add({ category: "preferences", key: "Tone", value: "Casual with friends" });
    if (!saved.ok) throw new Error("setup");
    expect(saved.fact.allowedAgentIds).toBeNull();
    expect(values(await p.services.facts(p.user.id, ["preferences"], p.conn))).toEqual(["Casual with friends"]);
  });

  it("does not change details saved before: an existing Sensitive detail that everyone could read stays as it was, and editing it does not limit it", async () => {
    const p = await setup();
    const key = await (await import("./identity")).getDataKey(db, p.user.id, masters);
    const { encryptField } = await import("./crypto");
    // a detail as it was stored before this change: Sensitive text, no limit
    const row = await p.t.profileFacts.insert({ category: "preferences", tier: 1, key: "Old allergy", valueEncrypted: encryptField(key, "Asthma, inhaler at 3pm", p.user.id, "profile_fact.value"), source: "manual", lastReviewedAt: new Date() });
    expect(values(await p.services.facts(p.user.id, ["preferences"], p.conn))).toEqual(["Asthma, inhaler at 3pm"]);
    const edited = await p.profile.update(row.id as string, { category: "preferences", key: "Old allergy", value: "Asthma, inhaler at 4pm" }, { confirmedWarnings: true });
    if (!edited.ok) throw new Error("setup");
    expect(edited.fact.allowedAgentIds).toBeNull();
    expect(values(await p.services.facts(p.user.id, ["preferences"], p.conn))).toEqual(["Asthma, inhaler at 4pm"]);
  });
});

describe("the confirm card for a health detail", () => {
  const form = fs.readFileSync("src/app/profile/FactForm.tsx", "utf8");
  const actions = fs.readFileSync("src/app/profile/actions.ts", "utf8");

  it("says what the detail is, who can see it, that it is the person's choice and that they can delete it any time", () => {
    expect(form).toContain("{SENSITIVE_CARD_WHAT} <strong>{v.key}</strong>: {v.value}");
    expect(form).toContain("SENSITIVE_CARD_WHO");
    expect(form).toContain("SENSITIVE_CARD_CHOICE");
    expect(SENSITIVE_CARD_WHO).toMatch(/no agent can read it until you choose which agents may/);
    expect(SENSITIVE_CARD_CHOICE).toMatch(/your choice to add it, and you can delete it any time/);
  });

  it("asks for an explicit, unchecked box, with the words 'health detail' and 'Sensitive label'", () => {
    expect(SENSITIVE_CONFIRM_LABEL).toBe("I want this health detail saved, with a Sensitive label.");
    expect(form).toContain('type="checkbox" name="confirm"');
    expect(form).not.toMatch(/defaultChecked|checked=/);
  });

  it("shows no agent as able to see a new health detail (the list comes from the control, which starts empty)", () => {
    expect(actions).toContain("health ? [] :");
  });
});
