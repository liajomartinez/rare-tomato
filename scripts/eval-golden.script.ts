// Golden sets A and B (M7). Run one action at a time:  EVAL=<action> npm run eval:golden
//   templates       write the empty label and expectation files for Lia to fill in (set-b/labels.TEMPLATE.json, set-a/expectations.TEMPLATE.json)
//   placeholders    write placeholder labels (meaningless on purpose) so the harness can be run end to end before Lia has labeled anything
//   validate        check Lia's files (labels.json, expectations.json): what is missing or wrong
//   setb-run        run a scorer on set B and SAVE the raw probabilities (evals/results/golden-b-raw-<scorer>.json). Spends a little on Claude Haiku.
//   setb-grade      grade the saved probabilities against labels (LABELS=path; default labels.json, or the placeholder file if that is all there is)
//   calibrate       try a grid of cut-offs over the saved probabilities (a suggestion for Lia; nothing is frozen)
//   seta-run        run the rule writer on set A inputs and SAVE the outputs. Spends a little on Claude Sonnet. In-memory database; nothing real is touched.
//   seta-grade      grade the saved outputs against expectations.json
// Lia writes every label and expectation. This script never does, and reports built from placeholders say so in their first line.
import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { it } from "vitest";
import { createTestDb, makeUser } from "@/db/testing";
import { tenantDb } from "@/db/tenant";
import { anthropicClient, estimateCostUsd, MODELS, type ModelClient } from "@/lib/claude";
import {
  calibrate, checkExpectations, checkLabels, expectationsTemplate, GOLDEN_DIR, gradeSetA, gradeSetB, labelsTemplate, loadSetA, loadSetB, placeholderLabels,
  type SetAExpectations, type SetAOutput, type SetBLabels, type SetBRaw,
} from "@/lib/evals/golden";
import { feedbackService } from "@/lib/feedback";
import { ruleWriter } from "@/lib/rule-writer";
import { thresholdsFromEnv } from "@/lib/scoring/config";
import { redact } from "@/lib/scoring/redact";
import { claudeScorer } from "@/lib/scoring/scorers";
import { tasksService } from "@/lib/tasks";

const RESULTS = path.resolve(process.cwd(), "evals/results");
const CAP_USD = Number(process.env.EVAL_CAP_USD ?? "1.5"); // the run stops before it spends more than this
const write = (file: string, data: unknown) => fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(file, "utf8")) as T;
const exists = (file: string) => fs.existsSync(file);

/** Counts what a run spends and stops it at the cap. */
function meter(inner: ModelClient) {
  const state = { usd: 0 };
  const client: ModelClient = {
    async complete(req) {
      if (state.usd >= CAP_USD) throw new Error(`The eval spend cap of $${CAP_USD} was reached.`);
      const reply = await inner.complete(req);
      state.usd += estimateCostUsd(req.model, reply.inputTokens, reply.outputTokens);
      return reply;
    },
  };
  return { client, state };
}

it("runs the golden-set action", async () => {
  const action = process.env.EVAL;
  const setB = loadSetB();
  const setA = loadSetA();
  const labelsPath = process.env.LABELS ?? (exists(path.join(GOLDEN_DIR, "set-b/labels.json")) ? path.join(GOLDEN_DIR, "set-b/labels.json") : path.join(GOLDEN_DIR, "set-b/labels.PLACEHOLDER.json"));
  const expectPath = process.env.EXPECTATIONS ?? path.join(GOLDEN_DIR, "set-a/expectations.json");

  if (action === "templates") {
    write(path.join(GOLDEN_DIR, "set-b/labels.TEMPLATE.json"), labelsTemplate(setB));
    write(path.join(GOLDEN_DIR, "set-a/expectations.TEMPLATE.json"), expectationsTemplate(setA));
    console.log("Wrote the empty templates. Copy each to labels.json / expectations.json and fill them in (Lia).");
  } else if (action === "placeholders") {
    write(path.join(GOLDEN_DIR, "set-b/labels.PLACEHOLDER.json"), placeholderLabels(setB));
    console.log("Wrote PLACEHOLDER labels (meaningless on purpose; for proving the harness only).");
  } else if (action === "validate") {
    if (exists(path.join(GOLDEN_DIR, "set-b/labels.json"))) console.log("Set B labels:", JSON.stringify(checkLabels(setB, read<SetBLabels>(path.join(GOLDEN_DIR, "set-b/labels.json")))));
    else console.log("Set B: no labels.json yet. Lia writes it (start from labels.TEMPLATE.json).");
    if (exists(expectPath)) console.log("Set A expectations:", JSON.stringify(checkExpectations(setA, read<SetAExpectations>(expectPath))));
    else console.log("Set A: no expectations.json yet. Lia writes it (start from expectations.TEMPLATE.json).");
  } else if (action === "setb-run") {
    const { client, state } = meter(anthropicClient());
    const scorer = claudeScorer(client);
    const raw: SetBRaw[] = [];
    for (const c of setB) {
      // Redacted exactly as in production before anything is sent.
      const started = performance.now();
      const out = await scorer.score({ summary: redact(c.task_summary).text, rules: [{ ref: "r1", text: redact(c.rule).text }] });
      raw.push({ id: c.id, scorer: scorer.name, model: out.modelVersion, pApplies: out.results[0].pApplies, pViolated: out.results[0].pViolated, latencyMs: Math.round(performance.now() - started), costUsd: out.costUsd });
    }
    write(path.join(RESULTS, `golden-b-raw-${scorer.name}.json`), { ran_at: new Date().toISOString(), thresholds_not_applied: true, raw });
    console.log(`Saved ${raw.length} raw outputs. Spent about $${state.usd.toFixed(4)}.`);
  } else if (action === "setb-grade" || action === "calibrate") {
    const scorerName = process.env.SCORER ?? "claude";
    const rawFile = path.join(RESULTS, `golden-b-raw-${scorerName}.json`);
    if (!exists(rawFile)) throw new Error("Run setb-run first.");
    const labels = read<SetBLabels>(labelsPath);
    const raw = read<{ raw: SetBRaw[] }>(rawFile).raw;
    const out = action === "calibrate" ? calibrate(setB, labels, raw) : gradeSetB(setB, labels, raw, thresholdsFromEnv());
    const file = path.join(RESULTS, `golden-b-${action}-${scorerName}${labels.placeholder ? "-PLACEHOLDER" : ""}.json`);
    write(file, out);
    console.log((out as { banner: string }).banner);
    console.log(`Wrote ${path.relative(process.cwd(), file)}`);
  } else if (action === "seta-run") {
    const { client, state } = meter(anthropicClient());
    const outputs: SetAOutput[] = [];
    const db = await createTestDb();
    for (const c of setA) {
      const masters = { current: randomBytes(32) };
      const user = await makeUser(db, c.id);
      const t = tenantDb(db, user.id);
      const conn = await t.agentConnections.insert({ name: c.agent, type: "other", linkConfirmedAt: new Date() });
      const logged = await tasksService(db, masters, user.id).logTask(conn.id as string, { externalId: c.id, summary: c.task_summary, category: c.category });
      if (!logged.ok) {
        outputs.push({ id: c.id, proposed: false, outcome: `task_refused`, costUsd: 0 });
        continue;
      }
      const fb = await feedbackService(db, masters, user.id).submit({ taskId: logged.taskId, rating: "down", reasonCodes: c.reason_codes, note: c.note });
      if (!fb.ok) {
        outputs.push({ id: c.id, proposed: false, outcome: "feedback_refused", costUsd: 0 });
        continue;
      }
      const before = state.usd;
      const r = await ruleWriter(db, masters, user.id, client).proposeFromFeedback(fb.feedback.id);
      outputs.push(
        r.kind === "proposed"
          ? { id: c.id, proposed: true, text: r.rule.text, category: r.rule.category, scope: r.rule.scope === "all" ? "all" : "this_agent", outcome: "proposed", costUsd: state.usd - before }
          : { id: c.id, proposed: false, outcome: r.kind, costUsd: state.usd - before },
      );
    }
    write(path.join(RESULTS, "golden-a-raw.json"), { ran_at: new Date().toISOString(), model: MODELS.ruleWriter, outputs });
    console.log(`Saved ${outputs.length} outputs. Spent about $${state.usd.toFixed(4)}.`);
  } else if (action === "seta-grade") {
    if (!exists(expectPath)) throw new Error("There is no expectations.json yet. Lia writes it (start from expectations.TEMPLATE.json).");
    const outputs = read<{ outputs: SetAOutput[] }>(path.join(RESULTS, "golden-a-raw.json")).outputs;
    const report = gradeSetA(setA, read<SetAExpectations>(expectPath), outputs);
    write(path.join(RESULTS, "golden-a-graded.json"), report);
    console.log(report.banner);
  } else {
    throw new Error("Set EVAL to templates, placeholders, validate, setb-run, setb-grade, calibrate, seta-run or seta-grade.");
  }
}, 1_800_000);
