import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/testing";
import { agentsAdmin } from "./agents-admin";
import { resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function setup() {
  const sub = `user_admin_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  const r = await resolveOAuthConnection(db, { authSubject: sub, clientId: `client-${crypto.randomUUID()}-0000` });
  if (!r.ok) throw new Error("expected ok");
  return { user, id: r.connection.id, admin: agentsAdmin(db, user.id) };
}

describe("the Agents screen actions", () => {
  it("confirming needs a valid type and a name", async () => {
    const { id, admin } = await setup();
    expect(await admin.confirm(id, { type: "robot", name: "Marge", extraScopes: [] })).toMatchObject({ ok: false });
    expect(await admin.confirm(id, { type: "muse", name: "   ", extraScopes: [] })).toMatchObject({ ok: false });
    expect(await admin.confirm(id, { type: "muse", name: "Marge", extraScopes: [] })).toEqual({ ok: true });
    expect((await admin.list())[0]).toMatchObject({ status: "active", name: "Marge", type: "muse" });
  });

  it("extra scopes are granted only when chosen, and unknown ones are ignored", async () => {
    const { id, admin } = await setup();
    await admin.confirm(id, { type: "muse", name: "Marge", extraScopes: ["profile:family", "admin:all"] });
    const scopes = (await admin.list())[0].scopes.sort();
    expect(scopes).toContain("profile:family");
    expect(scopes).not.toContain("profile:contacts");
    expect(scopes).not.toContain("admin:all");
  });

  it("access can be changed only after the agent is confirmed", async () => {
    const { id, admin } = await setup();
    expect(await admin.changeAccess(id, ["profile:basic"])).toMatchObject({ ok: false });
    await admin.confirm(id, { type: "muse", name: "Marge", extraScopes: [] });
    expect(await admin.changeAccess(id, ["profile:basic"])).toEqual({ ok: true });
    expect((await admin.list())[0].scopes).toEqual(["profile:basic"]);
  });

  it("renaming, revoking and removing work, and each stays inside this person's own agents", async () => {
    const a = await setup();
    const b = await setup();
    expect(await a.admin.rename(a.id, "Marge")).toEqual({ ok: true });
    expect(await b.admin.rename(a.id, "Hacked")).toMatchObject({ ok: false });
    expect(await b.admin.revoke(a.id)).toMatchObject({ ok: false });
    expect(await b.admin.remove(a.id)).toMatchObject({ ok: false });
    expect((await a.admin.list())[0].name).toBe("Marge");
    expect(await a.admin.revoke(a.id)).toEqual({ ok: true });
    expect((await a.admin.list())[0].status).toBe("revoked");
    expect(await a.admin.remove(a.id)).toEqual({ ok: true });
    expect(await a.admin.list()).toEqual([]);
  });

  it("a second agent of the same type cannot be confirmed", async () => {
    const one = await setup();
    const sub2 = (await one.admin.list()).length; // placeholder to keep the first agent in play
    expect(sub2).toBe(1);
    await one.admin.confirm(one.id, { type: "grok", name: "First", extraScopes: [] });
    const second = await resolveOAuthConnection(db, { authSubject: (await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, one.user.id) }))!.authSubject, clientId: "client-second-000000000000001" });
    if (!second.ok) throw new Error("expected ok");
    expect(await one.admin.confirm(second.connection.id, { type: "grok", name: "Second", extraScopes: [] })).toMatchObject({ ok: false });
  });
});
