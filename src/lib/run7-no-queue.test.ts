import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { rulesService } from "./rules";
import { makeServices } from "./services";
import { S } from "./strings";

// Run 7 (Lia's decision, 2026-10-03): a note on a thumbs-down is optional and there are no waiting drafts. A rule becomes visible to agents ONLY
// when the person taps Save; Not now deletes the draft; a draft nobody decides on is deleted. These tests keep those promises.

const masters = { current: randomBytes(32) };
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
const read = (p: string) => fs.readFileSync(p, "utf8");
const draft = (over: object = {}) => ({ text: "Ask me before booking anything.", category: "booking", when: "a booking", because: "You chose: Shouldn't have done this.", ...over });

async function person(label: string) {
  const user = await makeUser(db, label);
  const t = tenantDb(db, user.id);
  const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date(), scopes: ["rules:read"] });
  return { user, t, svc: rulesService(db, user.id), conn: conn.id as string };
}

describe("a draft is never visible to an agent until the person saves it", () => {
  it("is not served while it is only a draft, and is served after Save", async () => {
    const p = await person("served");
    const r = await p.svc.propose(draft({ draftExpiresAt: new Date(Date.now() + 60_000) }));
    if (!r.ok) throw new Error("setup");
    expect(await makeServices(db, masters).rules(p.user.id, p.conn)).toHaveLength(0);
    const saved = await p.svc.approve(r.rule.id);
    expect(saved.ok).toBe(true);
    expect((await makeServices(db, masters).rules(p.user.id, p.conn)).map((x) => x.id)).toEqual([r.rule.id]);
    if (saved.ok) expect(saved.rule.draftExpiresAt).toBeNull(); // a saved rule is no longer a draft, so it is never purged
  });
});

describe("Not now deletes the draft", () => {
  it("removes it for good: not pending, not kept as history, never served", async () => {
    const p = await person("notnow");
    const r = await p.svc.propose(draft({ draftExpiresAt: new Date(Date.now() + 60_000) }));
    if (!r.ok) throw new Error("setup");
    const gone = await p.svc.discard(r.rule.id);
    expect(gone.ok).toBe(true);
    expect(await p.t.rules.list()).toEqual([]);
    expect(await makeServices(db, masters).rules(p.user.id, p.conn)).toHaveLength(0);
  });

  it("refuses to discard a saved rule, and cannot touch another person's draft", async () => {
    const p = await person("keep");
    const q = await person("other");
    const live = await p.svc.propose(draft());
    if (!live.ok) throw new Error("setup");
    await p.svc.approve(live.rule.id);
    expect((await p.svc.discard(live.rule.id)).ok).toBe(false);
    expect((await p.svc.list()).filter((r) => r.status === "active")).toHaveLength(1);

    const theirs = await q.svc.propose(draft({ draftExpiresAt: new Date(Date.now() + 60_000) }));
    if (!theirs.ok) throw new Error("setup");
    const attempt = await p.svc.discard(theirs.rule.id);
    expect(attempt.ok).toBe(false);
    expect(await q.t.rules.list()).toHaveLength(1);
  });
});

describe("a draft nobody decides on is deleted, and nothing else is", () => {
  it("purges only expired drafts: not a fresh draft, not a proposal with no expiry, not a saved rule", async () => {
    const p = await person("purge");
    const now = new Date("2026-10-03T12:00:00Z");
    const expired = await p.svc.propose(draft({ text: "Expired draft rule here.", draftExpiresAt: new Date("2026-10-03T11:59:00Z") }));
    const fresh = await p.svc.propose(draft({ text: "Fresh draft rule here.", draftExpiresAt: new Date("2026-10-03T12:20:00Z") }));
    const older = await p.svc.propose(draft({ text: "An older proposal with no expiry." }));
    const saved = await p.svc.propose(draft({ text: "A saved rule that was a draft." , draftExpiresAt: new Date("2026-10-03T11:00:00Z") }));
    if (!expired.ok || !fresh.ok || !older.ok || !saved.ok) throw new Error("setup");
    await p.svc.approve(saved.rule.id, now);
    expect(await p.svc.purgeExpiredDrafts(now)).toBe(1);
    const left = (await p.svc.list()).map((r) => r.id).sort();
    expect(left).toEqual([fresh.rule.id, older.rule.id, saved.rule.id].sort());
  });
});

describe("the screens", () => {
  const rules = read("src/app/rules/page.tsx");
  const actions = read("src/app/rules/actions.ts");
  const feedActions = read("src/app/feed/actions.ts");
  const form = read("src/app/feed/FeedbackForm.tsx");

  it("Your rules has no 'Waiting for your decision' queue; the draft you were sent for is shown as the Proposed rule with Save rule and Discard", () => {
    expect(rules).not.toContain("Waiting for your decision");
    for (const needle of ["action={approveRule}", "action={discardDraft}", "S.rules.discard", "S.rules.eyebrow", "S.rules.save"]) expect(rules, needle).toContain(needle);
    // Owner decision 1 (2026-10-04): no lock anywhere. The designed draft has Save rule and Discard, and no edit-before-save on it.
    expect(rules).not.toMatch(/\b(lock|locked|unlock)/i);
    expect(rules).toContain("r.id === q.draft && r.draftExpiresAt !== null");
  });

  it("proposals from before run 7 and an agent's reported corrections are shown once, in their own section, never deleted silently", () => {
    expect(rules).toContain("OLD_PROPOSALS_HEADING");
    expect(rules).toContain("proposed.filter((r) => r.draftExpiresAt === null)");
    expect(actions).toContain("discardDraft");
    expect(rules).not.toContain("dismissRule");
  });

  it("Discard is the person's own tap; Save rule is still the only approval; no screen approves for them", () => {
    expect(actions).toContain("rulesFor(person.id).discard(");
    expect(actions).toContain("rulesFor(person.id).approve(");
    expect(feedActions).not.toMatch(/\.approve\(|editAndApprove\(/);
  });

  it("while the model runs the whole sheet shows 'Turning your feedback into a rule…' with nothing disabled, and every outcome ends on a page with a visible message", () => {
    expect(form).toContain("H.drafting");
    expect(S.sheet.drafting).toBe("Turning your feedback into a rule\u2026");
    expect(S.sheet.draftingNote).toBe("This usually takes a few seconds.");
    // the drafting state replaces the sheet's contents: nothing in that branch is disabled
    const drafting = form.slice(form.indexOf("{pending ? ("), form.indexOf(") : ("));
    expect(drafting).toContain("draft-bar");
    expect(drafting).not.toContain("disabled");
    expect(form).not.toContain("disabled={pending || picked");
    expect(form).toContain("pending");
    expect(feedActions).toContain("DRAFT_FAILED");
    expect(feedActions).toContain("Promise.race");
    expect(feedActions).toContain("backToFeed(");
    // the message is a banner on the feed page itself (not inside a task card that can disappear after a rating)
    expect(read("src/app/feed/page.tsx")).toContain("q.message ? <Notice>{q.message}</Notice>");
    expect(feedActions).not.toContain("return { ok: true, message: `Saved. We could not draft");
  });

  it("a server actions file exports only functions (the build fails otherwise)", () => {
    for (const f of ["src/app/feed/actions.ts", "src/app/rules/actions.ts"]) expect(read(f), f).not.toMatch(/^export const /m);
  });
});
