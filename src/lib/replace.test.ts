import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { agentsAdmin } from "./agents-admin";
import { listAgents } from "./agents-view";
import { confirmConnection, DEFAULT_SCOPES, resolveOAuthConnection, type Connection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { issueDemoToken, resolveBearerToken } from "./tokens";

// Replace-on-reconnect: "this replaces my old <agent>" (spec FR-A2).

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  const sub = `user_replace_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id), admin: agentsAdmin(db, user.id) };
}
const signIn = async (sub: string, clientId: string) => {
  const r = await resolveOAuthConnection(db, { authSubject: sub, clientId });
  if (!r.ok) throw new Error("expected ok");
  return r;
};
/** A person with an old confirmed Muse and a brand-new unassigned agent (Muse came back with a new identity). */
async function withReconnectingMuse(extraForOld: string[] = []) {
  const p = await person();
  const old = await signIn(p.sub, "muse-client-old-000000000001");
  await confirmConnection(p.t, old.connection.id, { type: "muse", name: "Marge", extraScopes: extraForOld });
  const fresh = await signIn(p.sub, "muse-client-new-000000000002");
  return { ...p, oldId: old.connection.id, freshId: fresh.connection.id };
}

describe("replacing your own old connection", () => {
  it("leaves exactly one connection of that type, with the chosen name", async () => {
    const p = await withReconnectingMuse();
    const done = await confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge", replaceId: p.oldId });
    expect(done?.type).toBe("muse");
    const agents = await listAgents(db, p.user.id);
    expect(agents.filter((a) => a.type === "muse")).toHaveLength(1);
    expect(agents.filter((a) => a.type === "muse")[0]).toMatchObject({ id: p.freshId, name: "Marge", status: "active" });
    expect(agents.find((a) => a.id === p.oldId)).toBeUndefined();
  });

  it("works through the Agents screen actions too", async () => {
    const p = await withReconnectingMuse();
    expect(await p.admin.confirm(p.freshId, { type: "muse", name: "Marge", extraScopes: [], replaceId: p.oldId })).toEqual({ ok: true });
    expect((await p.admin.list()).filter((a) => a.status === "active")).toHaveLength(1);
  });

  it("can replace a connection that was already disconnected", async () => {
    const p = await withReconnectingMuse();
    await p.admin.revoke(p.oldId);
    expect(await p.admin.confirm(p.freshId, { type: "muse", name: "Marge", extraScopes: [], replaceId: p.oldId })).toEqual({ ok: true });
  });

  it("without saying it replaces the old one, the swap is refused and nothing changes", async () => {
    const p = await withReconnectingMuse();
    await expect(confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge" })).rejects.toThrow(/This replaces my old Marge/);
    expect((await listAgents(db, p.user.id)).find((a) => a.id === p.oldId)?.status).toBe("active");
  });

  it("will not replace a connection of a different type", async () => {
    const p = await withReconnectingMuse();
    const claude = await signIn(p.sub, "https://claude.ai/oauth/client-metadata.json");
    await confirmConnection(p.t, claude.connection.id, { type: "claude", name: "Claude" });
    await expect(confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge", replaceId: claude.connection.id })).rejects.toThrow(/cannot be replaced/);
    expect((await listAgents(db, p.user.id)).find((a) => a.id === claude.connection.id)?.status).toBe("active");
  });

  it("will not 'replace' itself, or replace when nothing of that type exists", async () => {
    const p = await person();
    const only = await signIn(p.sub, "client-only-0000000000001");
    await expect(confirmConnection(p.t, only.connection.id, { type: "muse", name: "M", replaceId: only.connection.id })).rejects.toThrow(/cannot be replaced/);
  });
});

describe("it only ever affects your own connections", () => {
  it("another person's connection id cannot be replaced or removed, and stays active", async () => {
    const victim = await withReconnectingMuse();
    const attacker = await person();
    const mine = await signIn(attacker.sub, "muse-client-attacker-00000001");
    // Attacker tries to 'replace' the victim's Muse using the victim's connection id.
    await expect(confirmConnection(attacker.t, mine.connection.id, { type: "muse", name: "Marge", replaceId: victim.oldId })).rejects.toThrow(/cannot be replaced/);
    expect(await attacker.admin.confirm(mine.connection.id, { type: "muse", name: "Marge", extraScopes: [], replaceId: victim.oldId })).toMatchObject({ ok: false });
    const seen = await listAgents(db, victim.user.id);
    expect(seen.find((a) => a.id === victim.oldId)?.status).toBe("active");
    expect(await victim.t.agentConnections.get(victim.oldId)).not.toBeNull();
  });

  it("one person replacing their Muse does not disturb another person's Muse", async () => {
    const a = await withReconnectingMuse();
    const b = await withReconnectingMuse();
    await confirmConnection(a.t, a.freshId, { type: "muse", name: "Marge", replaceId: a.oldId });
    expect((await listAgents(db, b.user.id)).find((x) => x.id === b.oldId)?.status).toBe("active");
  });
});

describe("the old connection stops working immediately", () => {
  it("an old bearer token is rejected on the very next call", async () => {
    const p = await person();
    const { connection, token } = await issueDemoToken(p.t, "Old demo");
    expect((await resolveBearerToken(db, token)).ok).toBe(true);
    const fresh = await signIn(p.sub, "client-fresh-000000000001");
    await confirmConnection(p.t, fresh.connection.id, { type: "other", name: "New demo", replaceId: connection.id });
    expect(await resolveBearerToken(db, token)).toEqual({ ok: false, reason: "invalid" });
  });

  it("the old agent identity gets nothing: its next call is a fresh unassigned connection with no permissions", async () => {
    const p = await withReconnectingMuse(["profile:family"]);
    await confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge", replaceId: p.oldId });
    const again = await signIn(p.sub, "muse-client-old-000000000001");
    expect(again.isNew).toBe(true);
    expect(again.unassigned).toBe(true);
    expect(again.scopes).toEqual([]);
  });
});

describe("the new connection inherits nothing", () => {
  it("starts with only the default permissions, even if the old one could read family details", async () => {
    const p = await withReconnectingMuse(["profile:family", "profile:contacts"]);
    const done = (await confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge", replaceId: p.oldId })) as Connection;
    expect([...done.scopes].sort()).toEqual([...DEFAULT_SCOPES].sort());
    expect(done.scopes).not.toContain("profile:family");
    expect(done.scopes).not.toContain("profile:contacts");
  });

  it("gets extras only if they are ticked on the same form", async () => {
    const p = await withReconnectingMuse(["profile:family"]);
    const done = (await confirmConnection(p.t, p.freshId, { type: "muse", name: "Marge", extraScopes: ["profile:contacts"], replaceId: p.oldId })) as Connection;
    expect(done.scopes).toContain("profile:contacts");
    expect(done.scopes).not.toContain("profile:family");
  });
});
