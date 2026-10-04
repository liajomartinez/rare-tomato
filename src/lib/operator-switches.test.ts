import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { getFlag, jevEnabled, personFlag, setFlag, setPersonFlag, signupsOpen, SIGNUPS_KEY, spendByPerson } from "@/db/system";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import type { ModelClient } from "./claude";
import { CONNECTION_CAP, resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser, SignupsClosed } from "./identity";
import { gatedClient, ModelCallsStopped, PERSON_MODEL_OFF_FLAG, stopReason } from "./model-gate";

// Caps and switches an operator can flip without a deploy (spec FR-I1, FR-J1, FR-J2).

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

describe("the sign-ups switch (FR-J1)", () => {
  it("is open unless someone switches it off; when off, a NEW person is not created but an existing one still signs in", async () => {
    expect(await signupsOpen(db)).toBe(true);
    const existing = await findOrCreateUser(db, { authSubject: "user_existing_1", email: "e@example.test" });
    await setFlag(db, SIGNUPS_KEY, false);
    try {
      expect(await signupsOpen(db)).toBe(false);
      await expect(findOrCreateUser(db, { authSubject: "user_new_1", email: "n@example.test" })).rejects.toBeInstanceOf(SignupsClosed);
      expect((await findOrCreateUser(db, { authSubject: "user_existing_1" })).id).toBe(existing.id);
      // An agent signing in for a person who has no account yet is told the account is not set up; no account is created.
      expect(await resolveOAuthConnection(db, { authSubject: "user_new_2", clientId: "c1" })).toEqual({ ok: false, reason: "account_setup_incomplete" });
      await expect(findOrCreateUser(db, { authSubject: "user_new_2" })).rejects.toBeInstanceOf(SignupsClosed);
    } finally {
      await setFlag(db, SIGNUPS_KEY, true);
    }
    expect((await findOrCreateUser(db, { authSubject: "user_new_1", email: "n@example.test" })).email).toBe("n@example.test");
  });
});

describe("the per-person model switch (FR-J1)", () => {
  const counting = () => {
    let calls = 0;
    const client: ModelClient = { async complete() { calls++; return { text: "ok", inputTokens: 1, outputTokens: 1 }; } };
    return { client, count: () => calls };
  };
  const req = { model: "m", system: "s", user: "u", maxTokens: 5 };

  it("stops model calls for that person only, sends nothing, and can be switched back", async () => {
    const a = await makeUser(db, "off-a");
    const b = await makeUser(db, "off-b");
    const m = counting();
    await setPersonFlag(db, a.id, PERSON_MODEL_OFF_FLAG, true);
    expect(await personFlag(db, a.id, PERSON_MODEL_OFF_FLAG)).toBe(true);
    expect(await stopReason(db, a.id)).toBe("person_switched_off");
    await expect(gatedClient(db, a.id, m.client).complete(req)).rejects.toBeInstanceOf(ModelCallsStopped);
    expect(m.count()).toBe(0);
    expect(await stopReason(db, b.id)).toBeNull();
    await gatedClient(db, b.id, m.client).complete(req);
    expect(m.count()).toBe(1);
    await setPersonFlag(db, a.id, PERSON_MODEL_OFF_FLAG, false);
    expect(await stopReason(db, a.id)).toBeNull();
  });
});

describe("the Jev switch (FR-J1)", () => {
  it("is on unless switched off", async () => {
    expect(await jevEnabled(db)).toBe(true);
    await setFlag(db, "jev_calls_enabled", false);
    expect(await jevEnabled(db)).toBe(false);
    await setFlag(db, "jev_calls_enabled", true);
    expect(await getFlag(db, "jev_calls_enabled")).toBe(true);
  });
});

describe("the free-beta cap on connected agents (FR-I1)", () => {
  async function attested(label: string) {
    const sub = `user_${label}_${crypto.randomUUID()}`;
    const user = await findOrCreateUser(db, { authSubject: sub });
    await attestAdult(db, user.id);
    return { sub, user, t: tenantDb(db, user.id) };
  }

  it("the sixth new agent is refused with the cap reason, and nothing is created for it", async () => {
    const { sub, t } = await attested("cap5");
    for (let i = 0; i < CONNECTION_CAP; i++) expect((await resolveOAuthConnection(db, { authSubject: sub, clientId: `client-${i}` })).ok).toBe(true);
    expect(await resolveOAuthConnection(db, { authSubject: sub, clientId: "client-over" })).toEqual({ ok: false, reason: "cap_reached" });
    expect(await t.agentConnections.list()).toHaveLength(CONNECTION_CAP);
    // An agent already connected keeps working at the cap.
    expect((await resolveOAuthConnection(db, { authSubject: sub, clientId: "client-0" })).ok).toBe(true);
  });

  it("removing one makes room again", async () => {
    const { sub, t } = await attested("cap5b");
    for (let i = 0; i < CONNECTION_CAP; i++) await resolveOAuthConnection(db, { authSubject: sub, clientId: `client-${i}` });
    const [first] = (await t.agentConnections.list()) as { id: string }[];
    await t.agentConnections.update(first.id, { revokedAt: new Date() });
    expect((await resolveOAuthConnection(db, { authSubject: sub, clientId: "client-new" })).ok).toBe(true);
  });
});

describe("the operator spend summary (FR-J2)", () => {
  it("lists spend, proposals and task logs per person for a month, with no content", async () => {
    const u = await makeUser(db, "spend");
    const t = tenantDb(db, u.id);
    await t.addModelCost("2026-10", "anthropic", 0.25);
    await t.incrementUsage("2026-10", "taskLogs");
    const row = (await spendByPerson(db, "2026-10")).find((r) => r.userId === u.id);
    expect(row).toEqual({ userId: u.id, usd: 0.25, proposals: 0, taskLogs: 1 });
  });
});
