import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import {
  confirmConnection, DEFAULT_SCOPES, effectiveScopes, renameConnection, resolveOAuthConnection, revokeConnection,
  setScopes, suggestedTypeForClient, UNASSIGNED_LIFETIME_MS, type Connection,
} from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function attestedPerson(label: string) {
  const sub = `user_${label}_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub, email: `${label}@example.test` });
  await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id) };
}
const call = (sub: string, clientId: string, now?: Date) => resolveOAuthConnection(db, { authSubject: sub, clientId }, now);
const okOrThrow = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

describe("FR-A2: a new agent starts unassigned", () => {
  it("a first call creates exactly one unassigned connection with no scopes", async () => {
    const { sub, t } = await attestedPerson("first");
    const r = okOrThrow(await call(sub, "opaque-client-code"));
    expect(r.isNew).toBe(true);
    expect(r.unassigned).toBe(true);
    expect(r.scopes).toEqual([]);
    expect(r.connection.type).toBeNull();
    expect(r.connection.needsName).toBe(true);
    expect(await t.agentConnections.list()).toHaveLength(1);
  });

  it("a later sign-in from the same agent reuses that connection", async () => {
    const { sub, t } = await attestedPerson("reuse");
    await call(sub, "opaque-client-code");
    const again = okOrThrow(await call(sub, "opaque-client-code"));
    expect(again.isNew).toBe(false);
    expect(await t.agentConnections.list()).toHaveLength(1);
  });

  it("two different opaque agents get two separate unassigned connections, never merged or guessed", async () => {
    const { sub, t } = await attestedPerson("twoopaque");
    const a = okOrThrow(await call(sub, "grok-code-1234567890"));
    const b = okOrThrow(await call(sub, "muse-code-0987654321"));
    expect(a.connection.id).not.toBe(b.connection.id);
    expect(a.connection.type).toBeNull();
    expect(b.connection.type).toBeNull();
    expect(await t.agentConnections.list()).toHaveLength(2);
  });

  it("a recognised address only suggests a type; it does not assign it or grant anything", async () => {
    const { sub } = await attestedPerson("suggest");
    const claude = okOrThrow(await call(sub, "https://claude.ai/oauth/client-metadata.json"));
    const chatgpt = okOrThrow(await call(sub, "https://chatgpt.com/oauth/client.json"));
    expect(claude.connection.suggestedType).toBe("claude");
    expect(chatgpt.connection.suggestedType).toBe("chatgpt");
    for (const r of [claude, chatgpt]) {
      expect(r.connection.type).toBeNull();
      expect(r.unassigned).toBe(true);
      expect(r.scopes).toEqual([]);
    }
  });

  it("only exact addresses are recognised (lookalikes are not)", () => {
    expect(suggestedTypeForClient("https://claude.ai/x")).toBe("claude");
    expect(suggestedTypeForClient("https://claude.ai.evil.example/x")).toBeNull();
    expect(suggestedTypeForClient("https://notclaude.ai/x")).toBeNull();
    expect(suggestedTypeForClient("opaque-code")).toBeNull();
  });

  it("the connection belongs to the person who completed the sign-in, even for the same agent identity", async () => {
    const a = await attestedPerson("own-a");
    const b = await attestedPerson("own-b");
    const ra = okOrThrow(await call(a.sub, "https://claude.ai/oauth/client-metadata.json"));
    const rb = okOrThrow(await call(b.sub, "https://claude.ai/oauth/client-metadata.json"));
    expect(ra.connection.id).not.toBe(rb.connection.id);
    expect(ra.user.id).toBe(a.user.id);
    expect((await b.t.agentConnections.list()).map((c) => c.id)).not.toContain(ra.connection.id);
  });

  it("stores no OAuth token on the connection", async () => {
    const { sub } = await attestedPerson("notoken");
    const r = okOrThrow(await call(sub, "opaque-client-code"));
    expect(r.connection.tokenHash).toBeNull();
    expect(JSON.stringify(r.connection)).not.toMatch(/eyJ|Bearer/);
  });

  it("does nothing until the person has confirmed they are 18 or older", async () => {
    const sub = `user_unattested_${crypto.randomUUID()}`;
    expect(await call(sub, "opaque-client-code")).toEqual({ ok: false, reason: "account_setup_incomplete" });
    const user = await findOrCreateUser(db, { authSubject: sub });
    expect(await tenantDb(db, user.id).agentConnections.list()).toHaveLength(0);
  });
});

describe("an unassigned agent gets nothing (FR-A2, FR-A3)", () => {
  it("has no scopes, even if scopes were somehow written onto the row", async () => {
    const { sub, t } = await attestedPerson("zero");
    const r = okOrThrow(await call(sub, "opaque-client-code"));
    // Simulate a bug or an attack that writes scopes directly onto an unconfirmed connection.
    await t.agentConnections.update(r.connection.id, { scopes: [...DEFAULT_SCOPES, "profile:contacts", "profile:family"] });
    const again = okOrThrow(await call(sub, "opaque-client-code"));
    expect(again.scopes).toEqual([]);
    expect(effectiveScopes({ scopes: again.connection.scopes, linkConfirmedAt: null })).toEqual([]);
  });

  it("cannot have its scopes changed until it is confirmed", async () => {
    const { sub, t } = await attestedPerson("noscopeyet");
    const r = okOrThrow(await call(sub, "opaque-client-code"));
    expect(await setScopes(t, r.connection.id, ["profile:basic"])).toBeNull();
  });

  it("stops working 7 days after it was created if not confirmed", async () => {
    const { sub } = await attestedPerson("expire");
    const start = new Date("2026-10-01T12:00:00Z");
    okOrThrow(await call(sub, "opaque-client-code", start));
    const justBefore = new Date(start.getTime() + UNASSIGNED_LIFETIME_MS - 60_000);
    const justAfter = new Date(start.getTime() + UNASSIGNED_LIFETIME_MS + 60_000);
    expect((await call(sub, "opaque-client-code", justBefore)).ok).toBe(true);
    expect(await call(sub, "opaque-client-code", justAfter)).toEqual({ ok: false, reason: "expired" });
  });

  it("an expired unassigned connection cannot be confirmed", async () => {
    const { sub, t } = await attestedPerson("expireconfirm");
    const start = new Date("2026-10-01T12:00:00Z");
    const r = okOrThrow(await call(sub, "opaque-client-code", start));
    const late = new Date(start.getTime() + UNASSIGNED_LIFETIME_MS + 1000);
    expect(await confirmConnection(t, r.connection.id, { type: "muse", name: "Marge" }, late)).toBeNull();
  });
});

describe("confirming a connection", () => {
  it("assigns the type and name, clears the expiry, and grants only the default scopes", async () => {
    const { sub, t } = await attestedPerson("confirm");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    const confirmed = await confirmConnection(t, first.connection.id, { type: "muse", name: "  Marge  " });
    expect(confirmed?.type).toBe("muse");
    expect(confirmed?.name).toBe("Marge");
    expect(confirmed?.expiresAt).toBeNull();
    const next = okOrThrow(await call(sub, "opaque-client-code"));
    expect(next.unassigned).toBe(false);
    expect([...next.scopes].sort()).toEqual([...DEFAULT_SCOPES].sort());
  });

  it("contacts and family are granted only by the user's explicit choice", async () => {
    const { sub, t } = await attestedPerson("extras");
    const a = okOrThrow(await call(sub, "client-a-code-0000000001"));
    const b = okOrThrow(await call(sub, "client-b-code-0000000002"));
    await confirmConnection(t, a.connection.id, { type: "grok", name: "A" });
    await confirmConnection(t, b.connection.id, { type: "muse", name: "B", extraScopes: ["profile:contacts"] });
    expect(okOrThrow(await call(sub, "client-a-code-0000000001")).scopes).not.toContain("profile:contacts");
    const scopesB = okOrThrow(await call(sub, "client-b-code-0000000002")).scopes;
    expect(scopesB).toContain("profile:contacts");
    expect(scopesB).not.toContain("profile:family");
  });

  it("allows only one confirmed connection per person per agent type", async () => {
    const { sub, t } = await attestedPerson("onepertype");
    const a = okOrThrow(await call(sub, "client-a-code-0000000001"));
    const b = okOrThrow(await call(sub, "client-b-code-0000000002"));
    await confirmConnection(t, a.connection.id, { type: "grok", name: "A" });
    await expect(confirmConnection(t, b.connection.id, { type: "grok", name: "B" })).rejects.toThrow(/already have/);
  });

  it("a scope change takes effect on the next call", async () => {
    const { sub, t } = await attestedPerson("nextcall");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    await confirmConnection(t, first.connection.id, { type: "muse", name: "M" });
    await setScopes(t, first.connection.id, ["profile:basic"]);
    expect(okOrThrow(await call(sub, "opaque-client-code")).scopes).toEqual(["profile:basic"]);
  });

  it("ignores scope names we do not know", async () => {
    const { sub, t } = await attestedPerson("unknownscope");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    await confirmConnection(t, first.connection.id, { type: "muse", name: "M" });
    const updated = await setScopes(t, first.connection.id, ["profile:basic", "admin:everything"]);
    expect(updated?.scopes).toEqual(["profile:basic"]);
  });

  it("the display name is editable", async () => {
    const { sub, t } = await attestedPerson("rename");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    const renamed = await renameConnection(t, first.connection.id, "  Marge  ");
    expect(renamed?.name).toBe("Marge");
    expect(renamed?.needsName).toBe(false);
  });
});

describe("FR-A4: revoking", () => {
  it("the very next call after revoking is refused", async () => {
    const { sub, t } = await attestedPerson("revoke");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    await revokeConnection(t, first.connection.id);
    expect(await call(sub, "opaque-client-code")).toEqual({ ok: false, reason: "revoked" });
  });

  it("a revoked connection is not silently replaced by a new one for the same agent", async () => {
    const { sub, t } = await attestedPerson("norevive");
    const first = okOrThrow(await call(sub, "opaque-client-code"));
    await revokeConnection(t, first.connection.id);
    await call(sub, "opaque-client-code");
    expect(await t.agentConnections.list()).toHaveLength(1);
  });

  it("revoking one person's connection does not affect another's, and cannot be done across people", async () => {
    const a = await attestedPerson("iso-c");
    const b = await attestedPerson("iso-d");
    const ra = okOrThrow(await call(a.sub, "https://claude.ai/oauth/client-metadata.json"));
    const rb = okOrThrow(await call(b.sub, "https://claude.ai/oauth/client-metadata.json"));
    await revokeConnection(a.t, ra.connection.id);
    expect((await call(b.sub, "https://claude.ai/oauth/client-metadata.json")).ok).toBe(true);
    expect(await revokeConnection(a.t, rb.connection.id)).toBeNull();
    expect((await call(b.sub, "https://claude.ai/oauth/client-metadata.json")).ok).toBe(true);
  });
});

export type { Connection };
