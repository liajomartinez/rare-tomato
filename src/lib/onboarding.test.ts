import fs from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { listAgents } from "./agents-view";
import { attentionOf } from "./attention";
import { confirmConnection, resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { callsSeen, messageReady, needsFinishSetup, setupKindFor, setupState, verifyState } from "./onboarding";
import { CHATGPT_WEBSITE_NOTE, MUSE_DESKTOP_NOTE } from "./strings";

// Setup state comes from OUR OWN audit log only (handoff rev 8: "Setup success comes from real tool calls, not from 'I did it' buttons").

const at = (s: string) => new Date(s);
const call = (action: string, when: string, id: string | null = "c1") => ({ action, at: at(when), agentConnectionId: id });
const none = { rules: null, details: null, task: null };

describe("which real calls have been seen", () => {
  it("nothing seen with no calls", () => {
    expect(callsSeen("c1", [])).toEqual(none);
    expect(setupState("c1", [])).toEqual({ kind: "not_finished" });
  });

  it("get_rules and log_task are seen separately, each dated by its latest call", () => {
    const seen = callsSeen("c1", [call("get_rules", "2026-10-02T10:00:00Z"), call("get_rules", "2026-10-03T09:00:00Z"), call("log_task", "2026-10-03T09:05:00Z")]);
    expect(seen).toEqual({ rules: at("2026-10-03T09:00:00Z"), details: null, task: at("2026-10-03T09:05:00Z") });
    expect(setupState("c1", [call("get_rules", "2026-10-03T09:00:00Z")])).toEqual({ kind: "working", at: at("2026-10-03T09:00:00Z"), asked: "rules" });
  });

  it("a get_care_profile alone ends 'not finished' for the status line, and says it asked for details, not rules", () => {
    expect(setupState("c1", [call("get_care_profile", "2026-10-03T09:00:00Z")])).toEqual({ kind: "working", at: at("2026-10-03T09:00:00Z"), asked: "details" });
    expect(verifyState(callsSeen("c1", [call("get_care_profile", "2026-10-03T09:00:00Z")]))).toBe("waiting"); // the setup check wants get_rules
  });

  it("refused calls, the status tool, propose_correction and other connections' rows never count", () => {
    const rows = [
      call("refused:get_rules", "2026-10-03T09:02:00Z"),
      call("refused:log_task", "2026-10-03T09:03:00Z"),
      call("hello", "2026-10-03T09:04:00Z"),
      call("propose_correction", "2026-10-03T09:01:00Z"),
      call("get_rules", "2026-10-03T09:00:00Z", "c2"),
      call("log_task", "2026-10-03T09:00:00Z", null),
    ];
    expect(callsSeen("c1", rows)).toEqual(none);
    expect(setupState("c1", rows)).toEqual({ kind: "not_finished" });
  });
});

describe("the check for Claude and ChatGPT: waiting, partly done, ready", () => {
  const rules = at("2026-10-03T09:00:00Z");
  const task = at("2026-10-03T09:05:00Z");
  it("waiting when neither call has been seen", () => expect(verifyState(none)).toBe("waiting"));
  it("partly done when get_rules was seen but log_task was not", () => expect(verifyState({ ...none, rules })).toBe("partial"));
  it("ready only when both were seen", () => expect(verifyState({ rules, details: null, task })).toBe("ready"));
  it("a log_task with no get_rules is still waiting: the agent has not checked the rules", () => expect(verifyState({ ...none, task })).toBe("waiting"));
});

describe("Grok Bot and Muse: ready after the first real call", () => {
  it("get_rules or log_task is enough; nothing else is", () => {
    expect(messageReady(none)).toBe(false);
    expect(messageReady({ ...none, rules: new Date() })).toBe(true);
    expect(messageReady({ ...none, task: new Date() })).toBe(true);
    expect(messageReady({ ...none, details: new Date() })).toBe(false);
  });
});

describe("which agents still need a step", () => {
  const nf = { kind: "not_finished" } as const;
  const w = { kind: "working", at: new Date(), asked: "rules" } as const;
  const base = { status: "active", calls: none, setup: nf };

  it("how each platform is set up", () => {
    expect([setupKindFor("claude"), setupKindFor("chatgpt"), setupKindFor("grok"), setupKindFor("muse"), setupKindFor("other"), setupKindFor(null)]).toEqual(["guided", "guided", "message", "message", "none", "none"]);
  });

  it("Claude and ChatGPT need Finish setup until get_rules is seen", () => {
    expect(needsFinishSetup({ ...base, type: "claude" })).toBe(true);
    expect(needsFinishSetup({ ...base, type: "chatgpt", setup: w })).toBe(false);
  });

  it("Grok Bot and Muse need Finish setup until any real call is seen (Muse is shown as needing attention, as designed)", () => {
    expect(needsFinishSetup({ ...base, type: "muse" })).toBe(true);
    expect(needsFinishSetup({ ...base, type: "grok" })).toBe(true);
    expect(needsFinishSetup({ ...base, type: "muse", calls: { ...none, task: new Date() } })).toBe(false);
  });

  it("an agent we cannot classify, and anyone not confirmed, never needs Finish setup", () => {
    expect(needsFinishSetup({ ...base, type: "other" })).toBe(false);
    for (const status of ["unassigned", "expired", "revoked"]) expect(needsFinishSetup({ ...base, type: "claude", status })).toBe(false);
  });
});

describe("the state through the real audit log", () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  const person = async () => {
    const sub = `user_setup_${crypto.randomUUID()}`;
    const user = await findOrCreateUser(db, { authSubject: sub });
    await attestAdult(db, user.id);
    return { sub, user, t: tenantDb(db, user.id) };
  };

  it("a confirmed agent starts 'not finished' and flips on its own get_rules and log_task, not on a neighbour's", async () => {
    const p = await person();
    const q = await person();
    const a = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-setup-a-0000000000001" });
    const b = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "client-setup-b-0000000000002" });
    if (!a.ok || !b.ok) throw new Error("setup");
    await confirmConnection(p.t, a.connection.id, { type: "claude", name: "Claude" });
    await confirmConnection(p.t, b.connection.id, { type: "chatgpt", name: "ChatGPT" });
    expect((await listAgents(db, p.user.id)).map((x) => x.setup.kind)).toEqual(["not_finished", "not_finished"]);

    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "refused:get_rules", categoriesRead: [] });
    await p.t.auditLog.insert({ agentConnectionId: b.connection.id, actor: "agent", action: "log_task", categoriesRead: [] });
    let view = await listAgents(db, p.user.id);
    expect(view.every((x) => x.setup.kind === "not_finished")).toBe(true);
    expect(view.find((x) => x.name === "ChatGPT")!.calls.task).not.toBeNull();
    expect(verifyState(view.find((x) => x.name === "ChatGPT")!.calls)).toBe("waiting");

    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "get_rules", categoriesRead: [] });
    view = await listAgents(db, p.user.id);
    expect(view.find((x) => x.name === "Claude")!.setup.kind).toBe("working");
    expect(verifyState(view.find((x) => x.name === "Claude")!.calls)).toBe("partial");
    expect(view.find((x) => x.name === "ChatGPT")!.setup.kind).toBe("not_finished");
    expect(attentionOf(view).finish.map((x) => x.name)).toEqual(["ChatGPT"]);

    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "log_task", categoriesRead: [] });
    view = await listAgents(db, p.user.id);
    expect(verifyState(view.find((x) => x.name === "Claude")!.calls)).toBe("ready");

    // A different person's rows never leak in.
    expect(await listAgents(db, q.user.id)).toEqual([]);
  });

  it("an agent that has signed in but is not confirmed is under Needs confirmation, and counts once", async () => {
    const p = await person();
    const a = await resolveOAuthConnection(db, { authSubject: p.sub, clientId: "https://claude.ai/oauth/client-0000000000001" });
    if (!a.ok) throw new Error("setup");
    const view = await listAgents(db, p.user.id);
    const att = attentionOf(view);
    expect(att.confirm.map((x) => x.id)).toEqual([a.connection.id]);
    expect(att.finish).toEqual([]);
    expect(att.count).toBe(1);
  });
});

describe("the setup screen is built on real calls only", () => {
  const page = fs.readFileSync("src/app/start/setup/page.tsx", "utf8");

  it("reads the verify state from the audit-log calls, and never from a query word that a button could set", () => {
    expect(page).toContain("verifyState(seen)");
    expect(page).toContain("messageReady(mine.calls)");
    expect(page).not.toMatch(/searchParams[^;]*\b(done|ready|verified)\b/);
    expect(page).not.toMatch(/q\.(done|ready|verified)/);
  });

  it("shows Checked your rules, Reported the test task and Waiting", () => {
    expect(page).toContain("V.checkedRules");
    expect(page).toContain("V.reportedTask");
    expect(page).toContain("S.onb.setup.verify.waiting");
  });

  it("shows the confirm-and-name step before the next step when a new agent has signed in (decision 11)", () => {
    expect(page).toContain('a.status === "unassigned"');
    expect(page).toContain("<ConfirmForm");
    expect(page.indexOf("<ConfirmForm")).toBeLessThan(page.indexOf("<Guided"));
  });

  it("has the ChatGPT-website and Muse-desktop notes where the handoff puts them", () => {
    expect(CHATGPT_WEBSITE_NOTE).toMatch(/website/i);
    expect(MUSE_DESKTOP_NOTE).toMatch(/desktop/i);
    expect(page).toContain("CHATGPT_WEBSITE_NOTE");
    expect(page).toContain("MUSE_DESKTOP_NOTE");
    const finish = fs.readFileSync("src/app/agents/finish/page.tsx", "utf8");
    expect(finish).toContain("CHATGPT_WEBSITE_NOTE");
    expect(finish).toContain("MUSE_DESKTOP_NOTE");
  });
});
