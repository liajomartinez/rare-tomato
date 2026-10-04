import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import type { ModelClient } from "./claude";
import { feedbackService } from "./feedback";
import { ruleWriter } from "./rule-writer";
import { rulesService } from "./rules";
import { makeServices } from "./services";
import { FIX_IT_TAP_PATH, proposalUrl, TAP_TARGET } from "./tap-path";
import { tasksService } from "./tasks";

// FR-D6 and the success metric "thumbs-down to active rule in 4 taps or fewer". There is no browser test tool in the project
// (a new dependency needs an ADR), so this does two honest things: it checks the tap path against the real screens' source,
// and it runs the same four steps through the real services. A real-phone check is on Lia's list.

const read = (p: string) => fs.readFileSync(path.resolve(process.cwd(), p), "utf8");

describe("the tap path from a feed card to an approved rule", () => {
  it("is four taps or fewer", () => {
    expect(FIX_IT_TAP_PATH.length).toBeLessThanOrEqual(TAP_TARGET);
    expect(FIX_IT_TAP_PATH.map((s) => s.tap)).toEqual([1, 2, 3, 4]);
  });

  it("each step exists on the real screens", () => {
    for (const step of FIX_IT_TAP_PATH) expect(read(step.where), `${step.what}`).toContain(step.marker);
  });

  it("the thumbs-down opens the reasons without a page change (a button, not a link), and Send is the only other submit", () => {
    const form = read("src/app/feed/FeedbackForm.tsx");
    expect(form).toMatch(/type="button"[^>]*onClick=\{\(\) => setOpen/);
    expect(form.match(/type="submit"/g)?.length).toBe(2); // thumbs-up (one tap) and Send
  });

  it("after Send, a drafted rule opens Your rules where Save as a rule is a single button", () => {
    expect(read("src/app/feed/actions.ts")).toContain("redirect(proposalUrl(outcome.rule.id))");
    expect(proposalUrl("abc")).toBe("/rules?draft=abc");
    const rules = read("src/app/rules/page.tsx");
    const proposed = rules.slice(rules.indexOf("const proposal ="), rules.indexOf("<main"));
    expect(proposed).toContain("action={approveRule}");
    expect(proposed.match(/<button/g)!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("the same four steps through the real services", () => {
  let db: Db;
  const masters = { current: randomBytes(32) };
  beforeAll(async () => {
    db = await createTestDb();
  });

  it("a thumbs-down with one reason and a note leads to a drafted rule; one approval later the next get_rules serves it", async () => {
    const user = await makeUser(db, "taps");
    const t = tenantDb(db, user.id);
    const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write"] });
    const logged = await tasksService(db, masters, user.id).logTask(conn.id as string, { externalId: "t1", summary: "Booked the dentist at 8am", category: "booking" });
    if (!logged.ok) throw new Error("setup");
    const note = "Never book appointments before ten in the morning";
    const model: ModelClient = {
      async complete() {
        return {
          text: JSON.stringify({
            text: "Do not book appointments before 10 am.", category: "booking", scope: "all", when: "booking an appointment", do: null, dont: "book before 10 am",
            strength: "never", because: note, confidence: 0.9, needs_more_info: false, question: null,
          }),
          inputTokens: 10, outputTokens: 10,
        };
      },
    };
    // taps 1 to 3: thumbs-down, one reason, Send
    const fb = await feedbackService(db, masters, user.id).submit({ taskId: logged.taskId, rating: "down", reasonCodes: ["wrong_time_or_date"], note });
    if (!fb.ok) throw new Error("feedback failed");
    const drafted = await ruleWriter(db, masters, user.id, model).proposeFromFeedback(fb.feedback.id);
    expect(drafted.kind).toBe("proposed");
    if (drafted.kind !== "proposed") return;
    expect(await makeServices(db, masters).rules(user.id, conn.id as string)).toHaveLength(0); // nothing is served before approval
    // tap 4: Save as a rule (approves the drafted rule)
    expect((await rulesService(db, user.id).approve(drafted.rule.id)).ok).toBe(true);
    const served = await makeServices(db, masters).rules(user.id, conn.id as string);
    expect(served.map((r) => r.id)).toEqual([drafted.rule.id]);
  });
});
