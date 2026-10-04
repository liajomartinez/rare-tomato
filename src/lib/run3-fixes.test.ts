import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { hardDeleteAccount, purgeSoftDeleted } from "@/db/purge";
import { users } from "@/db/schema";
import { clearDeletedMark, isSubjectDeleted } from "@/db/system";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { auditEntries } from "./audit-view";
import { listAgents } from "./agents-view";
import { confirmConnection, removeConnection, resolveOAuthConnection } from "./connections";
import { AccountDeleted, attestAdult, findOrCreateUser } from "./identity";
import { exportAll, UNREADABLE } from "./data-export";
import { profileService } from "./profile";
import { createLimiter } from "./rate-limit";
import { tasksService } from "./tasks";
import { issueDemoToken, resolveBearerToken } from "./tokens";

const masters = { current: randomBytes(32) };
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

async function person() {
  const sub = `user_run3_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub, email: "x@example.test" });
  await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id) };
}
const usersFor = async (sub: string) => db.select().from(users).where(eq(users.authSubject, sub));

describe("a deleted account is not re-created by an old token or session", () => {
  it("an agent's still-valid sign-in cannot make a new account, and nothing is stored", async () => {
    const p = await person();
    const signed = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-run3-aaaaaaaaaaaa0001" });
    expect(signed.ok).toBe(true);
    await hardDeleteAccount(db, p.user.id);
    expect(await usersFor(p.sub)).toHaveLength(0);
    expect(await isSubjectDeleted(db, p.sub)).toBe(true);

    const again = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-run3-aaaaaaaaaaaa0001", email: "x@example.test" });
    expect(again).toEqual({ ok: false, reason: "account_setup_incomplete" });
    expect(await usersFor(p.sub)).toHaveLength(0); // no new row, no email stored
  });

  it("the website path is refused the same way (an old browser session)", async () => {
    const p = await person();
    await hardDeleteAccount(db, p.user.id);
    await expect(findOrCreateUser(db, { authSubject: p.sub, email: "x@example.test" })).rejects.toBeInstanceOf(AccountDeleted);
    expect(await usersFor(p.sub)).toHaveLength(0);
  });

  it("only a fresh sign-in (which clears the mark) starts a new, empty account", async () => {
    const p = await person();
    await p.t.profileFacts.insert({ category: "preferences", tier: 1, key: "k", valueEncrypted: "x", source: "manual" });
    await hardDeleteAccount(db, p.user.id);
    await clearDeletedMark(db, p.sub);
    const fresh = await findOrCreateUser(db, { authSubject: p.sub });
    expect(fresh.id).not.toBe(p.user.id);
    expect(await tenantDb(db, fresh.id).profileFacts.list()).toEqual([]);
    expect(fresh.adultAttestedAt).toBeNull(); // it must finish setup again
  });

  it("every connection and token of the deleted account is gone, and other people are untouched", async () => {
    const p = await person();
    const other = await person();
    const token = (await issueDemoToken(p.t)) as unknown as { token?: string } | string;
    const raw = typeof token === "string" ? token : (token.token as string);
    expect((await resolveBearerToken(db, raw)).ok).toBe(true);
    await hardDeleteAccount(db, p.user.id);
    expect((await resolveBearerToken(db, raw)).ok).toBe(false);
    expect(await usersFor(other.sub)).toHaveLength(1);
    expect(await isSubjectDeleted(db, other.sub)).toBe(false);
  });
});

describe("purging soft-deleted rows works when a removed agent had tasks", () => {
  it("removes the removed agent's tasks first, then the agent", async () => {
    const p = await person();
    const sign = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-run3-bbbbbbbbbbbb0002" });
    if (!sign.ok) throw new Error("setup");
    await confirmConnection(p.t, sign.connection.id, { type: "claude", name: "Claude" });
    const logged = await tasksService(db, masters, p.user.id).logTask(sign.connection.id, { externalId: "t1", summary: "Did a thing", category: "other" });
    expect(logged.ok).toBe(true);
    await removeConnection(p.t, sign.connection.id);
    const counts = await purgeSoftDeleted(db, p.user.id);
    expect(counts.agent_connections).toBe(1);
    expect(counts.tasks).toBe(1);
    expect(await p.t.agentConnections.list()).toEqual([]);
  });
});

describe("rate limits", () => {
  it("the audit view reads only the newest rows, limited in the database", async () => {
    const p = await person();
    for (let i = 0; i < 30; i++) await p.t.auditLog.insert({ actor: "user", action: `rule_approved:${i}`, categoriesRead: [] });
    const rows = await p.t.recentAudit(5);
    expect(rows).toHaveLength(5);
    expect((await auditEntries(db, p.user.id, 7)).length).toBe(7);
  });

  it("the Agents screen's last-asked and setup state come from a grouped query and stay correct with many rows", async () => {
    const p = await person();
    const sign = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-run3-cccccccccccc0003" });
    if (!sign.ok) throw new Error("setup");
    await confirmConnection(p.t, sign.connection.id, { type: "chatgpt", name: "ChatGPT" });
    for (let i = 0; i < 40; i++) await p.t.auditLog.insert({ agentConnectionId: sign.connection.id, actor: "agent", action: "get_rules", categoriesRead: [] });
    const [agent] = await listAgents(db, p.user.id);
    expect(agent.setup.kind).toBe("working");
    expect(agent.lastRulesFetchedAt).toBeInstanceOf(Date);
  });

  it("the download limiter lets ten through a minute, then says how long to wait, per person", () => {
    let now = 1_000_000;
    const l = createLimiter(10, 60_000, () => now);
    for (let i = 0; i < 10; i++) expect(l.check("a")).toBeNull();
    const wait = l.check("a");
    expect(wait).toBeGreaterThan(0);
    expect(l.check("b")).toBeNull(); // another person is not affected
    now += 61_000;
    expect(l.check("a")).toBeNull();
  });
});

describe("one unreadable value does not stop an export (FR-H1)", () => {
  it("is replaced by a placeholder, counted, and the rest of the data is still exported", async () => {
    const p = await person();
    const svc = profileService(db, masters, p.user.id);
    const good = await svc.add({ category: "preferences", key: "Good", value: "Readable one" });
    const bad = await svc.add({ category: "preferences", key: "Bad", value: "Will be corrupted" });
    if (!good.ok || !bad.ok) throw new Error("setup");
    await p.t.profileFacts.update(bad.fact.id, { valueEncrypted: "v1.AAAA.AAAA.AAAA" });
    const doc = await exportAll(db, masters, p.user.id);
    const values = (doc.tables.profileFacts as { value: string }[]).map((r) => r.value).sort();
    expect(values).toEqual(["Readable one", UNREADABLE].sort());
    expect(doc.account.values_that_could_not_be_read).toBe(1);
  });
});
