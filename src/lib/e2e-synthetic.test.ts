import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { hardDeleteAccount } from "@/db/purge";
import { ownedTables, type OwnedTableName } from "@/db/schema";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { careSheet } from "./care-sheet";
import type { ModelClient } from "./claude";
import { exportAll } from "./data-export";
import { feedbackService } from "./feedback";
import { handleMcp, type McpEnv } from "./handler";
import { profileService } from "./profile";
import { ruleWriter } from "./rule-writer";
import { rulesService } from "./rules";
import { currentChecks, scoreSummary, scoreTask } from "./scoring/run";
import { makeServices } from "./services";
import { issueDemoToken, resolveBearerToken } from "./tokens";

// The synthetic end-to-end run (MVP1 verification gate): the whole loop on fictional data, through the real handler, services and
// database code: connect the demo agent, log a task, a thumbs-down, a proposed rule, approval, get_rules returns it, scoring, the care
// sheet, a data export and a delete. Fakes stand in for Claude only.

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

const request = (body: unknown, token: string) =>
  new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "localhost:3000", authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
async function readJson(res: Response) {
  const text = await res.text();
  const data = text.split(/\r?\n/).find((l) => l.startsWith("data:"));
  return JSON.parse(text.startsWith("event:") && data ? data.slice(5) : text);
}
const call = (name: string, args: unknown = {}) => ({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
const toolText = (reply: { result: { content: { text: string }[] } }) => JSON.parse(reply.result.content[0].text);

const NOTE = "Never book appointments before ten in the morning";
const SUMMARY = "Booked the dentist for Dana next Tuesday at 8:00 am";

describe("the whole loop, on synthetic data", () => {
  it("connect, log, correct, approve, serve, score, care sheet, export, delete", async () => {
    const results: string[] = [];
    const user = await makeUser(db, "e2e");
    const t = tenantDb(db, user.id);
    const scored: string[] = [];
    const model: ModelClient = {
      async complete(req) {
        if (req.system.includes("probabilities")) return { text: '{"results":[{"rule":"r1","applies":0.95,"violated":0.9}]}', inputTokens: 100, outputTokens: 20 };
        return {
          text: JSON.stringify({ text: "Do not book appointments before 10 am.", category: "booking", scope: "all", when: "booking an appointment", do: null, dont: "book before 10 am", strength: "never", because: NOTE, confidence: 0.9, needs_more_info: false, question: null }),
          inputTokens: 100,
          outputTokens: 50,
        };
      },
    };
    // The scoring hook runs inline here so the test can wait for it (production runs it after the reply).
    const pending: Promise<unknown>[] = [];
    const services = makeServices(db, masters, model, (userId, taskId) => {
      pending.push(scoreTask(db, masters, userId, taskId, { model }).then((r) => scored.push(r.kind)));
    });
    const env: McpEnv = { allowedHosts: ["localhost"], auth: {}, services, resolveBearer: (tok) => resolveBearerToken(db, tok) };

    // 1. Connect the demo agent (bearer path: shown once, stored only as a hash).
    const { token, connection } = await issueDemoToken(t);
    expect(token).toMatch(/^rt_/);
    expect(JSON.stringify(await t.agentConnections.list())).not.toContain(token);
    results.push("connected the demo agent");

    // 2. The agent says hello and reads its (still empty) rules.
    const hello = await handleMcp(request(call("hello", { name: "Dana" }), token), env);
    expect(hello.status).toBe(200);
    const empty = toolText(await readJson(await handleMcp(request(call("get_rules"), token), env)));
    expect(JSON.stringify(empty)).not.toContain("Do not book");
    results.push("hello and empty get_rules");

    // 3. It logs a task.
    const logged = await readJson(await handleMcp(request(call("log_task", { external_id: "e2e-1", summary: SUMMARY, category: "booking", outcome: "completed" }), token), env));
    const taskId = toolText(logged).task_id as string;
    expect(taskId).toBeTruthy();
    await Promise.all(pending);
    expect(scored).toEqual(["no_rules"]); // nothing to score against yet
    results.push("logged a task");

    // 4. A thumbs-down with a reason and her own words; a rule is PROPOSED, and nothing is served until she approves.
    const fb = await feedbackService(db, masters, user.id).submit({ taskId, rating: "down", reasonCodes: ["wrong_time_or_date"], note: NOTE });
    if (!fb.ok) throw new Error("feedback failed");
    const drafted = await ruleWriter(db, masters, user.id, model).proposeFromFeedback(fb.feedback.id);
    if (drafted.kind !== "proposed") throw new Error(`expected a proposal, got ${drafted.kind}`);
    expect(drafted.rule.status).toBe("proposed");
    expect(JSON.stringify(toolText(await readJson(await handleMcp(request(call("get_rules"), token), env))))).not.toContain("Do not book");
    results.push("proposed rule is not served");

    // 5. She approves; the next get_rules includes it.
    expect((await rulesService(db, user.id).approve(drafted.rule.id)).ok).toBe(true);
    const served = toolText(await readJson(await handleMcp(request(call("get_rules"), token), env)));
    expect(JSON.stringify(served)).toContain("Do not book appointments before 10 am.");
    results.push("approved rule is served");

    // 6. A second task is scored against it (the hook), and the score summary stays honest: still learning.
    await readJson(await handleMcp(request(call("log_task", { external_id: "e2e-2", summary: "Booked the vet for Dana at 8:30 am", category: "booking" }), token), env));
    await Promise.all(pending);
    expect(scored).toEqual(["no_rules", "scored"]);
    const checks = await currentChecks(db, user.id);
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ verdict: "violated", scorer: "claude" });
    const summary = await scoreSummary(db, user.id);
    expect(summary.score.percent).toBeNull(); // fewer than 5 scored checks: still learning
    expect(summary.tasksLogged14d).toBe(2);
    results.push("scored and still learning");

    // 7. Care sheet and export.
    await profileService(db, masters, user.id).add({ category: "preferences", key: "Contact", value: "Prefers text over calls" });
    const sheet = await careSheet(db, masters, user.id, { categories: ["preferences"] });
    expect(sheet).toContain("Do not book appointments before 10 am.");
    expect(sheet).toContain("Prefers text over calls");
    const doc = await exportAll(db, masters, user.id);
    const text = JSON.stringify(doc);
    expect(text).toContain(SUMMARY);
    expect(text).toContain(NOTE);
    expect(text).not.toMatch(/"v1\./);
    expect(text).not.toContain(token);
    for (const name of Object.keys(ownedTables) as OwnedTableName[]) expect(doc.tables[name], name).toBeDefined();
    results.push("care sheet and export");

    // 8. Delete the account: every row is gone and the token stops working at once.
    await hardDeleteAccount(db, user.id);
    for (const name of Object.keys(ownedTables) as OwnedTableName[]) expect((await t[name].list()).length, name).toBe(0);
    expect((await handleMcp(request(call("get_rules"), token), env)).status).toBe(401);
    expect(connection.id).toBeTruthy();
    results.push("deleted everything; token refused");

    expect(results).toHaveLength(8);
  });
});
