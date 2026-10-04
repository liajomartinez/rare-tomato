import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { listAgents, whoCanSee } from "./agents-view";
import { confirmConnection, removeConnection, resolveOAuthConnection, revokeConnection, UNASSIGNED_LIFETIME_MS } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { issueDemoToken } from "./tokens";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  const sub = `user_view_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id) };
}
const signIn = (sub: string, clientId: string, now?: Date) => resolveOAuthConnection(db, { authSubject: sub, clientId }, now);
const okOrThrow = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error("expected ok");
  return r as Extract<T, { ok: true }>;
};

describe("the Agents screen data", () => {
  it("shows statuses for unassigned, active, revoked and expired agents", async () => {
    const p = await person();
    const start = new Date("2026-10-01T12:00:00Z");
    const active = okOrThrow(await signIn(p.sub, "client-active-0000000000001", start));
    const revoked = okOrThrow(await signIn(p.sub, "client-revoked-000000000002", start));
    await signIn(p.sub, "client-old-00000000000000003", new Date(start.getTime() - UNASSIGNED_LIFETIME_MS - 1000));
    await signIn(p.sub, "client-new-00000000000000004", start);
    await confirmConnection(p.t, active.connection.id, { type: "muse", name: "Marge" }, start);
    await revokeConnection(p.t, revoked.connection.id, start);
    const view = await listAgents(db, p.user.id, start);
    expect(view.map((a) => a.status).sort()).toEqual(["active", "expired", "revoked", "unassigned"]);
  });

  it("never includes tokens or hashes", async () => {
    const p = await person();
    await issueDemoToken(p.t);
    const view = await listAgents(db, p.user.id);
    expect(view[0].usesBearer).toBe(true);
    expect(JSON.stringify(view)).not.toMatch(/rt_|tokenHash|token_hash|[0-9a-f]{64}/);
  });

  it("only shows this person's agents", async () => {
    const a = await person();
    const b = await person();
    await signIn(a.sub, "client-a-0000000000000000001");
    expect(await listAgents(db, b.user.id)).toEqual([]);
  });
});

describe("who can see what (shown on the Profile screen)", () => {
  it("lists only active agents that hold the matching scope", async () => {
    const p = await person();
    const a = okOrThrow(await signIn(p.sub, "client-a-0000000000000000001"));
    const b = okOrThrow(await signIn(p.sub, "client-b-0000000000000000002"));
    okOrThrow(await signIn(p.sub, "client-c-0000000000000000003")); // stays unassigned
    await confirmConnection(p.t, a.connection.id, { type: "claude", name: "Claude" });
    await confirmConnection(p.t, b.connection.id, { type: "muse", name: "Marge", extraScopes: ["profile:family"] });
    const seen = whoCanSee(await listAgents(db, p.user.id));
    expect(seen.preferences.sort()).toEqual(["Claude", "Marge"]);
    expect(seen.family).toEqual(["Marge"]);
    expect(seen.contacts).toEqual([]);
  });
});

describe("removing a connection", () => {
  it("removes it from the list and lets the same agent start again as a fresh unassigned one", async () => {
    const p = await person();
    const first = okOrThrow(await signIn(p.sub, "client-again-000000000000001"));
    await confirmConnection(p.t, first.connection.id, { type: "muse", name: "Marge" });
    expect(await removeConnection(p.t, first.connection.id)).toBe(true);
    expect(await listAgents(db, p.user.id)).toEqual([]);
    const again = okOrThrow(await signIn(p.sub, "client-again-000000000000001"));
    expect(again.isNew).toBe(true);
    expect(again.unassigned).toBe(true);
    expect(again.scopes).toEqual([]);
    await confirmConnection(p.t, again.connection.id, { type: "muse", name: "Marge again" }); // the muse slot is free again
  });

  it("cannot remove another person's connection", async () => {
    const a = await person();
    const b = await person();
    const r = okOrThrow(await signIn(a.sub, "client-x-000000000000000001"));
    expect(await removeConnection(b.t, r.connection.id)).toBe(false);
    expect((await listAgents(db, a.user.id)).length).toBe(1);
  });
});

describe("connection health comes from our own records (FR-A5)", () => {
  it("shows when each agent last asked for the rules, taken from the audit log", async () => {
    const p = await person();
    const a = okOrThrow(await signIn(p.sub, "client-a-000000000000000001"));
    const b = okOrThrow(await signIn(p.sub, "client-b-000000000000000002"));
    await confirmConnection(p.t, a.connection.id, { type: "muse", name: "Marge" });
    await confirmConnection(p.t, b.connection.id, { type: "grok", name: "Grok" });
    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "get_rules", categoriesRead: [], at: new Date("2026-10-01T10:00:00Z") });
    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "get_rules", categoriesRead: [], at: new Date("2026-10-02T11:00:00Z") });
    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "get_care_profile", categoriesRead: ["preferences"], at: new Date("2026-10-03T12:00:00Z") });
    const view = await listAgents(db, p.user.id);
    expect(view.find((x) => x.name === "Marge")?.lastRulesFetchedAt?.toISOString()).toBe("2026-10-02T11:00:00.000Z");
    expect(view.find((x) => x.name === "Grok")?.lastRulesFetchedAt).toBeNull();
  });

  it("cannot be set by the agent: it is only what our server logged, and it is per person", async () => {
    const a = await person();
    const b = await person();
    const conn = okOrThrow(await signIn(a.sub, "client-a-000000000000000003"));
    await confirmConnection(a.t, conn.connection.id, { type: "muse", name: "Marge" });
    await a.t.auditLog.insert({ agentConnectionId: conn.connection.id, actor: "agent", action: "get_rules", categoriesRead: [] });
    expect((await listAgents(db, b.user.id)).length).toBe(0);
    expect((await listAgents(db, a.user.id))[0].lastRulesFetchedAt).not.toBeNull();
  });

  it("shows the last task each agent recorded, and flags an active agent not seen for more than 7 days", async () => {
    const p = await person();
    const conn = okOrThrow(await signIn(p.sub, "client-a-000000000000000004", new Date("2026-10-01T09:00:00Z")));
    await confirmConnection(p.t, conn.connection.id, { type: "muse", name: "Marge" }, new Date("2026-10-01T09:00:00Z"));
    await p.t.tasks.insert({ agentConnectionId: conn.connection.id, externalId: "x", summary: "s", category: "other", occurredAt: new Date("2026-10-02T09:00:00Z") });
    const later = new Date("2026-10-12T09:00:00Z");
    const view = (await listAgents(db, p.user.id, later))[0];
    expect(view.lastTaskAt?.toISOString()).toBe("2026-10-02T09:00:00.000Z");
    expect(view.notSeenRecently).toBe(true);
    expect((await listAgents(db, p.user.id, new Date("2026-10-04T09:00:00Z")))[0].notSeenRecently).toBe(false);
  });
});
