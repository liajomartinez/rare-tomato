import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { NextStepText, SetupStatus, StarterSteps } from "@/app/agents/Setup";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { listAgents } from "./agents-view";
import { AGENT_TYPES, confirmConnection, resolveOAuthConnection } from "./connections";
import { attestAdult, findOrCreateUser } from "./identity";
import { agentsNeedingStep, placementFor, setupState, STARTER_PLACEMENT } from "./onboarding";
import { MUSE_EXPERIMENTAL_LINE, MUSE_NO_REQUESTS, S, SETUP_NOT_FINISHED, STARTER_LINE } from "./strings";

const NO_TOOLS_CHECK_QUESTION = S.starter.checkQ;

const at = (s: string) => new Date(s);
const call = (action: string, when: string, id: string | null = "c1") => ({ action, at: at(when), agentConnectionId: id });

describe("starter-line state from the audit log only", () => {
  it("is 'not finished' with no calls", () => {
    expect(setupState("c1", [])).toEqual({ kind: "not_finished" });
  });

  it("is 'working' after the first real get_rules, dated by the latest one", () => {
    const s = setupState("c1", [call("get_rules", "2026-10-02T10:00:00Z"), call("get_rules", "2026-10-03T09:00:00Z")]);
    expect(s).toEqual({ kind: "working", at: at("2026-10-03T09:00:00Z"), asked: "rules" });
  });

  it("a get_care_profile alone also ends 'not finished', and says it asked for details, not rules", () => {
    expect(setupState("c1", [call("get_care_profile", "2026-10-03T09:00:00Z")])).toEqual({ kind: "working", at: at("2026-10-03T09:00:00Z"), asked: "details" });
  });

  it("log_task, hello, propose_correction and refused calls do not count", () => {
    const rows = [
      call("log_task", "2026-10-03T09:00:00Z"),
      call("propose_correction", "2026-10-03T09:01:00Z"),
      call("refused:get_rules", "2026-10-03T09:02:00Z"),
      call("refused:get_care_profile", "2026-10-03T09:03:00Z"),
      call("hello", "2026-10-03T09:04:00Z"),
    ];
    expect(setupState("c1", rows)).toEqual({ kind: "not_finished" });
  });

  it("another connection's calls, or rows with no connection, never count", () => {
    expect(setupState("c1", [call("get_rules", "2026-10-03T09:00:00Z", "c2"), call("get_rules", "2026-10-03T09:00:00Z", null)])).toEqual({ kind: "not_finished" });
  });

  it("counts only confirmed agents when saying how many need one more step", () => {
    const nf = { kind: "not_finished" } as const;
    const w = { kind: "working", at: new Date(), asked: "rules" } as const;
    const rows = [
      { status: "active", setup: nf },
      { status: "active", setup: w },
      { status: "unassigned", setup: nf },
      { status: "revoked", setup: nf },
      { status: "expired", setup: nf },
    ];
    expect(agentsNeedingStep(rows)).toBe(1);
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

  it("a confirmed agent starts 'not finished' and flips on its own first get_rules, not on a neighbour's", async () => {
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
    expect((await listAgents(db, p.user.id)).every((x) => x.setup.kind === "not_finished")).toBe(true);

    await p.t.auditLog.insert({ agentConnectionId: a.connection.id, actor: "agent", action: "get_rules", categoriesRead: [] });
    const view = await listAgents(db, p.user.id);
    expect(view.find((x) => x.name === "Claude")!.setup.kind).toBe("working");
    expect(view.find((x) => x.name === "ChatGPT")!.setup.kind).toBe("not_finished");
    expect(agentsNeedingStep(view)).toBe(1);

    // A different person's rows never leak in.
    expect(await listAgents(db, q.user.id)).toEqual([]);
  });
});

describe("the starter-line screen", () => {
  type A = Parameters<typeof SetupStatus>[0]["agent"];
  const agent = (over: object) =>
    ({
      id: "c1", name: "Marge", type: "claude", suggestedType: null, scopes: [], status: "active", lastSeenAt: null, expiresAt: null,
      usesBearer: false, lastRulesFetchedAt: null, lastTaskAt: null, notSeenRecently: false, setup: { kind: "not_finished" }, ...over,
    }) as A;
  const html = (a: A) =>
    renderToStaticMarkup(
      createElement("div", null, createElement(SetupStatus, { agent: a }), createElement(NextStepText, { agent: a, platform: "Claude" }), createElement(StarterSteps, { agent: a, platform: "Claude" })),
    );

  it("shows the approved line exactly, the check question and the honest limits", () => {
    const h = html(agent({}));
    expect(h).toContain(STARTER_LINE);
    expect(h).toContain(NO_TOOLS_CHECK_QUESTION);
    expect(h).toContain(SETUP_NOT_FINISHED);
    expect(h).toContain("we cannot tell whether you pasted the line");
    expect(h).toMatch(/small test/);
    expect(h).not.toMatch(/line (is|was|has been) (placed|saved|pasted)/i);
  });

  it("states the dated working line from the audit log, and never claims the line was placed", () => {
    const h = html(agent({ setup: { kind: "working", at: new Date("2026-10-03T09:00:00Z"), asked: "rules" } }));
    expect(h).toContain("Working: it asked for your rules on 3 Oct");
    expect(h).not.toContain(SETUP_NOT_FINISHED);
  });

  it("does not guess a menu name for an unknown agent (VERIFY)", () => {
    expect(STARTER_PLACEMENT.other).toEqual({ where: null, whereVerified: false });
    expect(html(agent({ type: "other" }))).toContain("not checked where this goes");
    expect(placementFor(null).whereVerified).toBe(false);
    expect(Object.keys(STARTER_PLACEMENT).sort()).toEqual([...AGENT_TYPES].sort());
  });

  it("Muse: experimental, no starter-line step, no chat sentence, never counted as 'Set up: not finished'", () => {
    // The agent card shows Muse's status and the experimental card; it never renders the starter-line steps for Muse (see agents/page.tsx).
    const h = renderToStaticMarkup(createElement(SetupStatus, { agent: agent({ type: "muse" }) }));
    expect(fs.readFileSync("src/app/agents/page.tsx", "utf8")).toContain("muse ? (");
    expect(h).toContain(MUSE_NO_REQUESTS);
    expect(h).not.toContain(STARTER_LINE);
    expect(h).not.toContain(NO_TOOLS_CHECK_QUESTION);
    expect(h).not.toContain(SETUP_NOT_FINISHED);
    expect(h).not.toContain("Copy the sentence");
    expect(MUSE_EXPERIMENTAL_LINE).toBe("Muse connects, but it may not check your rules on its own, and its connection may stop after an hour or two.");
    expect(agentsNeedingStep([{ status: "active", type: "muse", setup: { kind: "not_finished" } as never }])).toBe(0);
  });

  it("Grok Bot: optional, at the start of a chat, never in Auto-review Rules, and no check question", () => {
    const h = html(agent({ type: "grok" }));
    expect(h).toContain(S.onb.setup.guides["Grok Bot"].intro);
    expect(h).toMatch(/Do not paste the line into Auto-review Rules/);
    expect(h).toContain("No setup step is needed");
    expect(h).not.toContain(NO_TOOLS_CHECK_QUESTION);
    expect(h).not.toContain("not checked where this goes");
    expect(STARTER_PLACEMENT.grok.optional).toBe(true);
  });

  it("the starter line is the handoff wording (UX-1 revision 6), word for word", () => {
    expect(STARTER_LINE).toBe("At the start of any task you do for me, check my Rare Tomato rules first, then record what you did.");
  });
});
