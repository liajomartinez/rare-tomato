import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { confirmConnection, resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { onboardingStatus } from "./onboarding-status";

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  const sub = `user_status_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id) };
}
async function connect(p: Awaited<ReturnType<typeof person>>, client: string) {
  const r = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: client });
  if (!r.ok) throw new Error("expected ok");
  return r.connection;
}
const audit = (p: Awaited<ReturnType<typeof person>>, agentConnectionId: string, action: string) =>
  p.t.auditLog.insert({ agentConnectionId, actor: "agent", action, categoriesRead: [] });

describe("onboarding status for one agent", () => {
  it("walks through the five events as they happen", async () => {
    const p = await person();
    const c = await connect(p, "client-status-000000000000001");
    let s = await onboardingStatus(db, p.user.id, c.id);
    expect(s).toMatchObject({ status: "unassigned", confirmed: null, firstGetRules: null, firstLogTask: null, firstRuleSaved: null });
    expect(s?.appeared).toBeTruthy();

    await confirmConnection(p.t, c.id, { type: "claude", name: "Claude" });
    s = await onboardingStatus(db, p.user.id, c.id);
    expect(s?.status).toBe("active");
    expect(s?.confirmed).toBeTruthy();

    await audit(p, c.id, "get_rules");
    s = await onboardingStatus(db, p.user.id, c.id);
    expect(s?.firstGetRules).toBeTruthy();
    expect(s?.firstLogTask).toBeNull();

    await audit(p, c.id, "refused:log_task");
    expect((await onboardingStatus(db, p.user.id, c.id))?.firstLogTask).toBeNull(); // a refused call does not count
    await audit(p, c.id, "log_task");
    expect((await onboardingStatus(db, p.user.id, c.id))?.firstLogTask).toBeTruthy();

    await p.t.rules.insert({ text: "Keep it short.", category: "style", structured: {}, status: "proposed" });
    expect((await onboardingStatus(db, p.user.id, c.id))?.firstRuleSaved).toBeNull(); // a proposal is not saved yet
    await p.t.rules.insert({ text: "Keep it short.", category: "style", structured: {}, status: "active", approvedAt: new Date(), approvedBy: p.user.id });
    expect((await onboardingStatus(db, p.user.id, c.id))?.firstRuleSaved).toBeTruthy();
  });

  it("does not count another agent's calls, and gives nothing for another person's agent", async () => {
    const a = await person();
    const b = await person();
    const ca = await connect(a, "client-status-000000000000002");
    const cb = await connect(a, "client-status-000000000000003");
    await audit(a, ca.id, "get_rules");
    expect((await onboardingStatus(db, a.user.id, cb.id))?.firstGetRules).toBeNull();
    expect(await onboardingStatus(db, b.user.id, ca.id)).toBeNull();
  });

  it("carries no tokens, names or other details", async () => {
    const p = await person();
    const c = await connect(p, "client-status-000000000000004");
    await confirmConnection(p.t, c.id, { type: "claude", name: "Secret Name" });
    const json = JSON.stringify(await onboardingStatus(db, p.user.id, c.id));
    expect(json).not.toContain("Secret Name");
    expect(Object.keys(JSON.parse(json)).sort()).toEqual(["appeared", "confirmed", "firstGetRules", "firstLogTask", "firstRuleSaved", "status"]);
  });
});
