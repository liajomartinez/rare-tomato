import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { getFlag } from "@/db/system";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import type { ModelClient, ModelRequest } from "./claude";
import { checkConflicts } from "./conflicts";
import { feedbackService } from "./feedback";
import { budgetAlert, gatedClient, limitsFromEnv, ModelCallsStopped, modelCallsEnabled, setModelCallsEnabled, stopReason } from "./model-gate";
import { ruleWriter } from "./rule-writer";
import { rulesService } from "./rules";
import { tasksService } from "./tasks";

let db: Db;
const masters = { current: randomBytes(32) };
const month = new Date().toISOString().slice(0, 7);
const limits = { monthlyBudgetUsd: 10, personMonthlyLimitUsd: 1 };
beforeAll(async () => {
  db = await createTestDb();
});

function counting(text = "ok") {
  const calls: ModelRequest[] = [];
  const client: ModelClient = { async complete(req) { calls.push(req); return { text, inputTokens: 10, outputTokens: 1 }; } };
  return { client, calls };
}
const req: ModelRequest = { model: "m", system: "s", user: "u", maxTokens: 5 };
const person = async (label: string) => {
  const user = await makeUser(db, label);
  return { user, t: tenantDb(db, user.id) };
};
// The switch and the budget are service-wide, so every test starts from a known state and puts it back.
const reset = async () => {
  await setModelCallsEnabled(db, true);
};

describe("the kill switch", () => {
  it("is ON unless someone switches it off, and a missing flag means on", async () => {
    expect(await getFlag(db, "model_calls_enabled")).toBeUndefined();
    expect(await modelCallsEnabled(db)).toBe(true);
  });

  it("when off, a call is refused and NOTHING is sent to the model; when switched on again it works", async () => {
    const p = await person("switch");
    const m = counting();
    const gated = gatedClient(db, p.user.id, m.client, limits);
    await setModelCallsEnabled(db, false);
    await expect(gated.complete(req)).rejects.toBeInstanceOf(ModelCallsStopped);
    expect(m.calls).toHaveLength(0);
    expect(await stopReason(db, p.user.id, limits)).toBe("switched_off");
    await reset();
    await gated.complete(req);
    expect(m.calls).toHaveLength(1);
  });
});

describe("spending limits", () => {
  it("a person at their own monthly limit is stopped, and nobody else is", async () => {
    await reset();
    const a = await person("limit-a");
    const b = await person("limit-b");
    await a.t.addModelCost(month, "anthropic", 1.0);
    expect(await stopReason(db, a.user.id, limits)).toBe("person_limit_reached");
    expect(await stopReason(db, b.user.id, limits)).toBeNull();
    const m = counting();
    await expect(gatedClient(db, a.user.id, m.client, limits).complete(req)).rejects.toBeInstanceOf(ModelCallsStopped);
    expect(m.calls).toHaveLength(0);
  });

  it("when everyone together reaches the monthly budget, every call is stopped", async () => {
    await reset();
    const spenders = await Promise.all([person("bud-1"), person("bud-2"), person("bud-3")]);
    expect(await stopReason(db, spenders[0].user.id, { monthlyBudgetUsd: 1000, personMonthlyLimitUsd: 5000 })).toBeNull();
    // Push the total over a small budget by adding cost for several people.
    for (const s of spenders) await s.t.addModelCost(month, "anthropic", 0.4);
    const spentNow = await (await import("@/db/system")).monthlyModelSpend(db, month);
    expect(await stopReason(db, spenders[0].user.id, { monthlyBudgetUsd: spentNow, personMonthlyLimitUsd: 5000 })).toBe("budget_reached");
    expect(await stopReason(db, spenders[0].user.id, { monthlyBudgetUsd: spentNow + 1, personMonthlyLimitUsd: 5000 })).toBeNull();
  });

  it("spend from an earlier month does not count against this month", async () => {
    await reset();
    const p = await person("rollover");
    await p.t.addModelCost("2020-01", "anthropic", 99);
    expect(await stopReason(db, p.user.id, limits)).toBeNull();
  });

  it("alerts at 50%, 80% and 100% of the budget, each reported once", async () => {
    await reset();
    const p = await person("alerts");
    const total = await (await import("@/db/system")).monthlyModelSpend(db, month);
    const budget = total + 10; // everything so far plus $10 of room
    const lim = { monthlyBudgetUsd: budget, personMonthlyLimitUsd: 1000 };
    expect((await budgetAlert(db, lim)).level).toBeNull();
    await p.t.addModelCost(month, "anthropic", (budget * 0.5 - total) + 0.01);
    const half = await budgetAlert(db, lim);
    expect(half).toMatchObject({ level: 0.5, isNew: true });
    expect((await budgetAlert(db, lim)).isNew).toBe(false);
    await p.t.addModelCost(month, "anthropic", budget * 0.3);
    expect(await budgetAlert(db, lim)).toMatchObject({ level: 0.8, isNew: true });
    await p.t.addModelCost(month, "anthropic", budget * 0.3);
    expect(await budgetAlert(db, lim)).toMatchObject({ level: 1, isNew: true });
    // put the budget out of reach for the rest of this file
    expect(await stopReason(db, p.user.id, lim)).toBe("budget_reached");
  });

  it("reads the limits from settings, and falls back to the defaults for blanks and nonsense", () => {
    expect(limitsFromEnv({ MODEL_MONTHLY_BUDGET_USD: "25", MODEL_PERSON_MONTHLY_LIMIT_USD: "0.75" })).toEqual({ monthlyBudgetUsd: 25, personMonthlyLimitUsd: 0.75 });
    expect(limitsFromEnv({})).toEqual({ monthlyBudgetUsd: 50, personMonthlyLimitUsd: 1 });
    expect(limitsFromEnv({ MODEL_MONTHLY_BUDGET_USD: "abc", MODEL_PERSON_MONTHLY_LIMIT_USD: "-3" })).toEqual({ monthlyBudgetUsd: 50, personMonthlyLimitUsd: 1 });
  });
});

describe("what happens to the person when calls are stopped", () => {
  async function setup(label: string) {
    const user = await makeUser(db, label);
    const t = tenantDb(db, user.id);
    const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date() });
    const logged = await tasksService(db, masters, user.id).logTask(conn.id as string, { externalId: "j", summary: "Agreed to a price", category: "messaging" });
    if (!logged.ok) throw new Error("setup");
    const fb = await feedbackService(db, masters, user.id).submit({ taskId: logged.taskId, rating: "down", reasonCodes: ["other"], note: "Never agree to a price without checking with me first" });
    if (!fb.ok) throw new Error("setup");
    return { user, t, feedbackId: fb.feedback.id };
  }

  it("with the switch off, the feedback is kept, no rule is drafted, no model is called, and the monthly allowance is not used up", async () => {
    const p = await setup("paused");
    await setModelCallsEnabled(db, false);
    const m = counting("{}");
    const r = await ruleWriter(db, masters, p.user.id, gatedClient(db, p.user.id, m.client, limits)).proposeFromFeedback(p.feedbackId);
    await reset();
    expect(r).toEqual({ kind: "paused", reason: "switched_off" });
    expect(m.calls).toHaveLength(0);
    expect(await p.t.feedback.list()).toHaveLength(1);
    expect(await p.t.rules.list()).toHaveLength(0);
    expect((await p.t.usage(month)).proposals).toBe(0);
  });

  it("a conflict check made while calls are stopped says 'unchecked' rather than guessing", async () => {
    await reset();
    const user = await makeUser(db, "paused-conflict");
    const svc = rulesService(db, user.id);
    const live = await svc.propose({ text: "Always tell buyers the price is firm", category: "messaging", when: "w", because: "b" });
    if (live.ok) await svc.approve(live.rule.id);
    const prop = await svc.propose({ text: "Offer buyers a small discount", category: "messaging", when: "w", because: "b" });
    if (!prop.ok) throw new Error("setup");
    await setModelCallsEnabled(db, false);
    const m = counting("independent");
    const check = await checkConflicts(db, user.id, prop.rule.id, gatedClient(db, user.id, m.client, limits));
    await reset();
    expect(check?.results[0].verdict).toBe("unchecked");
    expect(m.calls).toHaveLength(0);
  });
});
