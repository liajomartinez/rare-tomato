import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { orderRules, rulesService, type RuleRecord } from "./rules";
import { makeServices } from "./services";

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

async function person(label: string) {
  const user = await makeUser(db, label);
  const t = tenantDb(db, user.id);
  const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date() });
  return { user, t, svc: rulesService(db, user.id), conn: conn.id as string };
}
const draft = (extra: Record<string, unknown> = {}) => ({
  text: "Check with me before agreeing to a price or a time",
  category: "messaging",
  when: "a buyer asks for a discount or a pickup time",
  because: "Never agree to a price or time without checking with me first",
  ...extra,
});
const ok = (r: { ok: boolean }): RuleRecord => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return (r as unknown as { rule: RuleRecord }).rule;
};

describe("rule lifecycle (FR-E2, FR-E5)", () => {
  it("a proposed rule is never served to an agent", async () => {
    const p = await person("proposed");
    ok(await p.svc.propose(draft()));
    expect(await p.svc.servedTo(p.conn)).toHaveLength(0);
    expect(await makeServices(db, masters).rules(p.user.id, p.conn)).toHaveLength(0);
  });

  it("approving makes it active, records the person's approval, and the next get_rules includes it", async () => {
    const p = await person("approve");
    const r = ok(await p.svc.propose(draft()));
    const approved = ok(await p.svc.approve(r.id));
    expect(approved.status).toBe("active");
    expect(approved.approvedAt).not.toBeNull();
    const audit = await p.t.auditLog.list();
    expect(audit.some((a) => a.actor === "user" && a.action === `rule_approved:${r.id}`)).toBe(true);
    const served = await makeServices(db, masters).rules(p.user.id, p.conn);
    expect(served.map((s) => s.id)).toEqual([r.id]);
  });

  it("a draft cannot carry its own status, and every route to active leaves an approval record", async () => {
    const p = await person("noside");
    const r = ok(await p.svc.propose(draft()));
    const sneaky = ok(await p.svc.propose(draft({ status: "active" })));
    expect(sneaky.status).toBe("proposed");
    await p.svc.approve(r.id);
    const edited = ok(await p.svc.editAndApprove(r.id, draft({ text: "Ask me first" })));
    const audit = (await p.t.auditLog.list()).map((a) => a.action as string);
    expect(audit).toContain(`rule_approved:${r.id}`);
    expect(audit.some((a) => a.startsWith("rule_locked"))).toBe(false);
    expect(audit).toContain(`rule_edited_and_approved:${edited.id}`);
  });

  it("approving twice, or approving a missing rule, fails", async () => {
    const p = await person("twice");
    const r = ok(await p.svc.propose(draft()));
    await p.svc.approve(r.id);
    expect((await p.svc.approve(r.id)).ok).toBe(false);
    expect((await p.svc.approve("00000000-0000-0000-0000-000000000000")).ok).toBe(false);
  });

  it("editing makes a new version and retires the old one; the history stays", async () => {
    const p = await person("edit");
    const r = ok(await p.svc.propose(draft()));
    await p.svc.approve(r.id);
    const v2 = ok(await p.svc.editAndApprove(r.id, draft({ text: "Ask me first, always" })));
    expect(v2.version).toBe(2);
    expect(v2.supersedesId).toBe(r.id);
    expect((await p.svc.get(r.id))?.status).toBe("retired");
    expect((await p.svc.servedTo(p.conn)).map((s) => s.id)).toEqual([v2.id]);
  });

  it("an edited rule stays active, and a retired rule is not served", async () => {
    const p = await person("editactive");
    const r = ok(await p.svc.propose(draft()));
    await p.svc.approve(r.id);
    const v2 = ok(await p.svc.editAndApprove(r.id, draft()));
    expect(v2.status).toBe("active");
    await p.svc.retire(v2.id);
    expect(await p.svc.servedTo(p.conn)).toHaveLength(0);
  });

  it("there is no way to lock a rule: the service has no lock, and a stored 'locked' row is read as active", async () => {
    const p = await person("nolock");
    expect("lock" in p.svc).toBe(false);
    const a = ok(await p.svc.propose(draft()));
    await p.svc.approve(a.id);
    // An old row that still carries the retired value is read as active, so it is never lost or hidden.
    await p.t.rules.update(a.id, { status: "locked" });
    expect((await p.svc.get(a.id))?.status).toBe("active");
    expect((await p.svc.servedTo(p.conn)).map((r) => r.id)).toEqual([a.id]);
  });

  it("turning down a proposed rule ('not quite') keeps it as history, never serves it, and cannot be done to an approved rule", async () => {
    const p = await person("dismiss");
    const r = ok(await p.svc.propose(draft()));
    const down = ok(await p.svc.dismiss(r.id));
    expect(down.status).toBe("retired");
    expect(await p.svc.servedTo(p.conn)).toHaveLength(0);
    expect((await p.svc.approve(r.id)).ok).toBe(false); // a turned-down rule cannot be approved by accident
    const live = ok(await p.svc.propose(draft()));
    await p.svc.approve(live.id);
    expect((await p.svc.dismiss(live.id)).ok).toBe(false);
  });

  it("keeps the link to the feedback that caused a proposal, including through an edit", async () => {
    const p = await person("source");
    const fbId = crypto.randomUUID();
    const r = ok(await p.svc.propose(draft({ sourceFeedbackId: fbId })));
    expect(r.sourceFeedbackId).toBe(fbId);
    const v2 = ok(await p.svc.editAndApprove(r.id, draft({ sourceFeedbackId: r.sourceFeedbackId })));
    expect(v2.sourceFeedbackId).toBe(fbId);
  });

  it("rejects bad input and cleans markup", async () => {
    const p = await person("bad");
    expect((await p.svc.propose(draft({ category: "weather" }))).ok).toBe(false);
    expect((await p.svc.propose(draft({ when: "" }))).ok).toBe(false);
    expect((await p.svc.propose(draft({ scope: "agent:not-an-id" }))).ok).toBe(false);
    expect((await p.svc.propose(draft({ strength: "sometimes" }))).ok).toBe(false);
    const r = ok(await p.svc.propose(draft({ text: "Ask me <script>x</script>first" })));
    expect(r.text).not.toContain("<");
    expect(r.text).toBe("Ask me xfirst");
  });

  it("an agent-scoped rule is served only to that agent, and other people's rules never appear", async () => {
    const p = await person("scope");
    const other = await person("scope-other");
    const r = ok(await p.svc.propose(draft({ scope: `agent:${p.conn}` })));
    await p.svc.approve(r.id);
    const r2 = ok(await other.svc.propose(draft()));
    await other.svc.approve(r2.id);
    expect((await p.svc.servedTo(p.conn)).map((s) => s.id)).toEqual([r.id]);
    expect(await p.svc.servedTo("11111111-1111-1111-1111-111111111111")).toHaveLength(0);
  });
});

describe("precedence order (FR-E4, FR-E6, spec 6.4)", () => {
  const base = { scope: "all", when: "x", createdAt: new Date("2026-01-01") };
  const mk = (id: string, over: Record<string, unknown> = {}) => ({ id, status: "active" as const, ...base, ...over }) as RuleRecord;

  it("then agent-specific, then narrower when, then newer, then id", () => {
    const order = orderRules([
      mk("d-old"),
      mk("c-new", { createdAt: new Date("2026-03-01") }),
      mk("b-narrow", { when: "a narrower condition" }),
      mk("a-agent", { scope: "agent:1" }),
    ]);
    expect(order.map((r) => r.id)).toEqual(["a-agent", "b-narrow", "c-new", "d-old"]);
    expect(orderRules([mk("z"), mk("y")]).map((r) => r.id)).toEqual(["y", "z"]);
  });

  it("KNOWN LIMIT (provisional): a long vague condition outranks a short precise one, because narrower is measured as longer text", () => {
    const order = orderRules([
      mk("short-precise", { when: "buyer asks for $10 off" }),
      mk("long-vague", { when: "whenever anything comes up that might involve some kind of money or timing" }),
    ]);
    // This documents today's behavior, not what we want. If the measure changes, this test should change with it.
    expect(order.map((r) => r.id)).toEqual(["long-vague", "short-precise"]);
  });

  it("the order does not depend on the input order", () => {
    const rules = [mk("a", { when: "aaa" }), mk("b"), mk("c", { scope: "agent:1" }), mk("d")];
    expect(orderRules(rules).map((r) => r.id)).toEqual(orderRules([...rules].reverse()).map((r) => r.id));
  });
});

describe("ID and card numbers are turned away from rules (open item 18)", () => {
  it("a rule or an edit that holds a card number is refused; a spending-limit rule is fine", async () => {
    const p = await person("cardrule");
    expect(await p.svc.propose(draft({ text: "Always pay with card 4111 1111 1111 1111" }))).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(await p.svc.propose(draft({ because: "my password is hunter2 so check first" }))).toMatchObject({ ok: false, reason: "invalid_input" });
    const good = ok(await p.svc.propose(draft({ text: "Ask me before spending over $50 on this card", when: "any purchase", because: "I want to approve spending over $50" })));
    expect(good.text).toContain("$50");
    expect(await p.svc.editAndApprove(good.id, draft({ text: "Use card 4111 1111 1111 1111 for everything" }))).toMatchObject({ ok: false });
  });
});
