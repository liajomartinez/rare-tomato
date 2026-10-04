import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { whoCanSeeFact, listAgents } from "./agents-view";
import { careSheet } from "./care-sheet";
import { confirmConnection, removeConnection, resolveOAuthConnection, revokeConnection } from "./connections";
import { exportAll } from "./data-export";
import { attestAdult, findOrCreateUser } from "./identity";
import { profileService } from "./profile";
import { makeServices } from "./services";

// Open item 19: "only to agents I choose" for a detail. Tenant and scope tests: an agent that is not on the list gets nothing, a list can only
// name this person's own connected agents, and nothing carries over to a replacement connection.

const masters = { current: randomBytes(32) };
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup() {
  const sub = `user_vis_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  const t = tenantDb(db, user.id);
  const connect = async (type: "claude" | "chatgpt" | "grok", extra: string[] = []) => {
    const r = await resolveOAuthConnection(db, { authSubject: sub, clientId: `client-vis-${type}-${crypto.randomUUID().slice(0, 8)}0000` });
    if (!r.ok) throw new Error("setup");
    await confirmConnection(t, r.connection.id, { type, name: type, extraScopes: extra });
    return r.connection.id;
  };
  return { sub, user, t, profile: profileService(db, masters, user.id), services: makeServices(db, masters), connect };
}
const values = (facts: { value: string }[]) => facts.map((f) => f.value).sort();

describe("a detail limited to chosen agents", () => {
  it("by default every agent that holds the category permission gets it", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const b = await p.connect("chatgpt");
    await p.profile.add({ category: "preferences", key: "Tone", value: "Casual" });
    expect(values(await p.services.facts(p.user.id, ["preferences"], a))).toEqual(["Casual"]);
    expect(values(await p.services.facts(p.user.id, ["preferences"], b))).toEqual(["Casual"]);
  });

  it("is served only to the chosen agent; the other gets nothing, and not even a placeholder", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const b = await p.connect("chatgpt");
    const added = await p.profile.add({ category: "preferences", key: "Private", value: "Only for Claude" });
    await p.profile.add({ category: "preferences", key: "Open", value: "For everyone" });
    if (!added.ok) throw new Error("setup");
    expect(await p.profile.setVisibility(added.fact.id, [a])).toEqual({ ok: true });

    expect(values(await p.services.facts(p.user.id, ["preferences"], a))).toEqual(["For everyone", "Only for Claude"]);
    const forB = await p.services.facts(p.user.id, ["preferences"], b);
    expect(values(forB)).toEqual(["For everyone"]);
    expect(JSON.stringify(forB)).not.toMatch(/Private|Only for Claude/);
  });

  it("an empty list means nobody", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const added = await p.profile.add({ category: "preferences", key: "Hold", value: "Nobody yet" });
    if (!added.ok) throw new Error("setup");
    await p.profile.setVisibility(added.fact.id, []);
    expect(await p.services.facts(p.user.id, ["preferences"], a)).toEqual([]);
  });

  it("going back to the default serves it to everyone again", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const added = await p.profile.add({ category: "preferences", key: "Back", value: "Default again" });
    if (!added.ok) throw new Error("setup");
    await p.profile.setVisibility(added.fact.id, []);
    await p.profile.setVisibility(added.fact.id, null);
    expect(values(await p.services.facts(p.user.id, ["preferences"], a))).toEqual(["Default again"]);
  });

  it("being on the list is not enough: the agent must still hold the category permission", async () => {
    const p = await setup();
    const a = await p.connect("claude"); // no profile:family
    const family = await p.profile.add({ category: "family", key: "Theo", value: "Needs notice" });
    if (!family.ok) throw new Error("setup");
    await p.profile.setVisibility(family.fact.id, [a]);
    const agents = await listAgents(db, p.user.id);
    expect(whoCanSeeFact(agents, "family", [a])).toEqual([]);
  });

  it("refuses an id that is not one of this person's confirmed agents, and changes nothing", async () => {
    const p = await setup();
    const other = await setup();
    const mine = await p.connect("claude");
    const theirs = await other.connect("claude");
    const added = await p.profile.add({ category: "preferences", key: "Safe", value: "Stays default" });
    if (!added.ok) throw new Error("setup");

    for (const bad of [[theirs], [mine, theirs], ["00000000-0000-4000-8000-000000000000"]]) {
      const r = await p.profile.setVisibility(added.fact.id, bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/not one of your connected agents/);
    }
    expect((await p.profile.get(added.fact.id))!.allowedAgentIds).toBeNull();

    // an agent that was never confirmed, and one that was disconnected, cannot be named either
    const fresh = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-vis-unconfirmed-0000000001" });
    if (!fresh.ok) throw new Error("setup");
    expect((await p.profile.setVisibility(added.fact.id, [fresh.connection.id])).ok).toBe(false);
    await revokeConnection(p.t, mine);
    expect((await p.profile.setVisibility(added.fact.id, [mine])).ok).toBe(false);
  });

  it("another person cannot change the setting on this person's detail", async () => {
    const p = await setup();
    const other = await setup();
    const added = await p.profile.add({ category: "preferences", key: "Mine", value: "Mine only" });
    if (!added.ok) throw new Error("setup");
    const r = await other.profile.setVisibility(added.fact.id, []);
    expect(r).toEqual({ ok: false, message: "That detail was not found." });
    expect((await p.profile.get(added.fact.id))!.allowedAgentIds).toBeNull();
  });

  it("a replacement connection starts with nothing: the old agent's place on the list does not carry over", async () => {
    const p = await setup();
    const oldId = await p.connect("claude");
    const added = await p.profile.add({ category: "preferences", key: "Held", value: "Held for old Claude" });
    if (!added.ok) throw new Error("setup");
    await p.profile.setVisibility(added.fact.id, [oldId]);

    const fresh = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-vis-replacement-000000001" });
    if (!fresh.ok) throw new Error("setup");
    await confirmConnection(p.t, fresh.connection.id, { type: "claude", name: "Claude 2", replaceId: oldId });
    expect(await p.services.facts(p.user.id, ["preferences"], fresh.connection.id)).toEqual([]);
    await removeConnection(p.t, fresh.connection.id);
  });

  it("never goes on the sheet copied for agents that cannot connect, even with sensitive details included", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const limited = await p.profile.add({ category: "preferences", key: "Limited", value: "Limited detail" });
    await p.profile.add({ category: "preferences", key: "Plain", value: "Plain detail" });
    if (!limited.ok) throw new Error("setup");
    await p.profile.setVisibility(limited.fact.id, [a]);
    const sheet = await careSheet(db, masters, p.user.id, { categories: ["preferences"], includeSensitive: true });
    expect(sheet).toContain("Plain detail");
    expect(sheet).not.toContain("Limited detail");
  });

  it("the person's own export shows the setting", async () => {
    const p = await setup();
    const a = await p.connect("claude");
    const added = await p.profile.add({ category: "preferences", key: "Exp", value: "Exported detail" });
    if (!added.ok) throw new Error("setup");
    await p.profile.setVisibility(added.fact.id, [a]);
    const json = JSON.stringify(await exportAll(db, masters, p.user.id));
    expect(json).toContain("Exported detail");
    expect(json).toContain(a);
  });
});

describe("the Who-can-see-this form action", () => {
  it("accepts only 'all' or 'chosen', so a stale or odd form can never widen a limited detail", async () => {
    const src = (await import("node:fs")).readFileSync("src/app/profile/actions.ts", "utf8");
    expect(src).toMatch(/mode !== "all" && mode !== "chosen"/);
  });
});
