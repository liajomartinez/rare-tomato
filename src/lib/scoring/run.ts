import type { Db } from "@/db/client";
import { tenantDb, type Row } from "@/db/tenant";
import { ModelCallsStopped, type GateReason } from "../model-gate";
import { profileService } from "../profile";
import { rulesService, type RuleRecord } from "../rules";
import { tasksService } from "../tasks";
import type { MasterKeys } from "../crypto";
import { MAX_CANDIDATE_RULES, thresholdsFromEnv, type Thresholds } from "./config";
import { namesFromText, redact } from "./redact";
import { claudeScorer, type Scorer, type ScoreOutput } from "./scorers";
import { adherenceScore, verdictFor, type AdherenceScore, type Verdict } from "./verdict";
import type { ModelClient } from "../claude";
import { logSafeError } from "../safe-log";

// Scoring one task (spec 6.5, FR-F1 to F4). ADVISORY ONLY: nothing here, or anything that reads the result, blocks, changes or reverses what
// an agent did. Every verdict is about what the agent REPORTED, and is shown as agent-reported.
//
// Order of work: pick up to 5 candidate rules, decrypt the summary inside the service, REDACT it (and the rule text), send only the
// redacted text to a scorer, turn probabilities into verdicts with the configured cut-offs, give anything uncertain to Claude, and ask the
// person ("Was this right?") if it is still uncertain. The readable text is never logged or stored by this code.

export type ScoreRun =
  | { kind: "scored"; checks: number; verdicts: Record<Verdict, number>; scorer: string }
  | { kind: "no_task" }
  | { kind: "no_rules" }
  | { kind: "already_scored" }
  | { kind: "paused"; reason: GateReason }
  | { kind: "failed"; reason: "scorer_error" };

export interface ScoreDeps {
  /** Claude, already wrapped by the gate (kill switch, budget, per-person limit): a stopped call sends nothing. */
  model: ModelClient;
  /** The Jev scorer, or undefined when it is off (the default). */
  jev?: Scorer;
  thresholds?: Thresholds;
}

const emptyCounts = (): Record<Verdict, number> => ({ followed: 0, violated: 0, not_applicable: 0, uncertain: 0 });
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

/** The up-to-5 live rules that could apply to this task: same category, scope that includes the task's agent, in precedence order. */
export function candidateRules(servedToAgent: RuleRecord[], category: string): RuleRecord[] {
  return servedToAgent.filter((r) => r.category === category).slice(0, MAX_CANDIDATE_RULES);
}

/** Names we know about from the person's own details and agents, so redaction catches them wherever they appear. Held in memory only. */
async function knownNames(db: Db, masters: MasterKeys, userId: string): Promise<string[]> {
  const facts = await profileService(db, masters, userId).list(["family", "contacts"]);
  const agents = (await tenantDb(db, userId).agentConnections.list()) as Row[];
  return namesFromText(...facts.flatMap((f) => [f.key, f.value]), ...agents.map((a) => String(a.name ?? "")));
}

export async function scoreTask(db: Db, masters: MasterKeys, userId: string, taskId: string, deps: ScoreDeps, now = new Date()): Promise<ScoreRun> {
  const t = tenantDb(db, userId);
  const thresholds = deps.thresholds ?? thresholdsFromEnv();

  const task = await tasksService(db, masters, userId).get(taskId);
  if (!task) return { kind: "no_task" };

  const served = await rulesService(db, userId).servedTo(task.connectionId);
  const candidates = candidateRules(served, task.category);
  if (candidates.length === 0) return { kind: "no_rules" };

  // Idempotent: a rule already checked for this task by a scorer is skipped, so a retry never double-scores.
  const done = new Set(((await t.adherenceChecks.find({ taskId })) as Row[]).map((r) => r.ruleId as string));
  const todo = candidates.filter((r) => !done.has(r.id));
  if (todo.length === 0) return { kind: "already_scored" };

  // Redaction happens HERE, before anything leaves the service. The placeholder ids (r1, r2...) stand in for the real rule ids.
  const ctx = { knownNames: await knownNames(db, masters, userId) };
  const input = {
    summary: redact(task.summary, ctx).text,
    rules: todo.map((r, i) => ({ ref: `r${i + 1}`, text: redact(r.text, ctx).text })),
  };
  const refToRule = new Map(todo.map((r, i) => [`r${i + 1}`, r]));

  const month = monthKey(now);
  const spend = async (out: ScoreOutput) => t.addModelCost(month, out.provider, out.costUsd).catch((error) => { logSafeError(error, "scoring"); return undefined; });
  const primary: Scorer = deps.jev ?? claudeScorer(deps.model);
  const claude = claudeScorer(deps.model);

  let first: ScoreOutput;
  try {
    first = await primary.score(input);
    await spend(first);
  } catch (e) {
    if (e instanceof ModelCallsStopped) return { kind: "paused", reason: e.reason };
    return { kind: "failed", reason: "scorer_error" };
  }

  type Final = { rule: RuleRecord; scorer: "jev" | "claude"; model: string; pApplies: number | null; pViolated: number | null; verdict: Verdict };
  const finals: Final[] = first.results.map((r) => ({
    rule: refToRule.get(r.ref)!,
    scorer: primary.name,
    model: first.modelVersion,
    pApplies: r.pApplies,
    pViolated: r.pViolated,
    verdict: verdictFor(r.pApplies, r.pViolated, thresholds),
  }));

  // "Uncertain" goes to the second opinion (Claude Haiku). Only when the first scorer was not already Claude.
  const unsure = finals.filter((f) => f.verdict === "uncertain");
  if (primary.name !== "claude" && unsure.length > 0) {
    try {
      const refs = new Map(unsure.map((f, i) => [`r${i + 1}`, f]));
      const second = await claude.score({
        summary: input.summary,
        rules: [...refs.entries()].map(([ref, f]) => ({ ref, text: redact(f.rule.text, ctx).text })),
      });
      await spend(second);
      for (const r of second.results) {
        const f = refs.get(r.ref);
        if (!f) continue;
        f.scorer = "claude";
        f.model = second.modelVersion;
        f.pApplies = r.pApplies;
        f.pViolated = r.pViolated;
        f.verdict = verdictFor(r.pApplies, r.pViolated, thresholds);
      }
    } catch (e) {
      if (e instanceof ModelCallsStopped) return { kind: "paused", reason: e.reason };
      // The second opinion failed: those stay uncertain. Nothing is guessed.
    }
  }

  const verdicts = emptyCounts();
  let stored = 0;
  for (const f of finals) {
    try {
      await t.adherenceChecks.insert({
        taskId,
        ruleId: f.rule.id,
        verdict: f.verdict,
        pApplies: f.pApplies === null ? null : String(f.pApplies),
        pViolated: f.pViolated === null ? null : String(f.pViolated),
        scorer: f.scorer,
        modelVersion: f.model,
        thresholdsJson: thresholds,
      });
      verdicts[f.verdict]++;
      stored++;
    } catch (error) {
      logSafeError(error, "scoring");
      // Another run stored this pair first (the database allows one automatic check per task and rule). Nothing to do.
    }
  }
  return { kind: "scored", checks: stored, verdicts, scorer: primary.name };
}

/** The person's own answer to "Was this right?" for one task and rule. It overrides the scorers and is recorded as theirs. */
export async function recordUserVerdict(db: Db, userId: string, taskId: string, ruleId: string, verdict: Verdict): Promise<boolean> {
  if (!(["followed", "violated", "not_applicable"] as string[]).includes(verdict)) return false;
  const t = tenantDb(db, userId);
  const task = await t.tasks.get(taskId).catch((error) => { logSafeError(error, "scoring"); return null; });
  const rule = await t.rules.get(ruleId).catch((error) => { logSafeError(error, "scoring"); return null; });
  if (!task || !rule) return false;
  await t.adherenceChecks.insert({ taskId, ruleId, verdict, scorer: "user", modelVersion: null, thresholdsJson: null });
  return true;
}

export interface CheckView {
  taskId: string;
  ruleId: string;
  ruleText: string;
  verdict: Verdict;
  scorer: "jev" | "claude" | "user";
  at: Date;
  /** True when no scorer could decide and the person has not answered yet. */
  needsAnswer: boolean;
}

/** The current verdict for each (task, rule): the person's newest answer if there is one, otherwise the scorer's. */
export async function currentChecks(db: Db, userId: string): Promise<CheckView[]> {
  const t = tenantDb(db, userId);
  const [rows, rules] = await Promise.all([t.adherenceChecks.list() as Promise<Row[]>, t.rules.list() as Promise<Row[]>]);
  const text = new Map(rules.map((r) => [r.id as string, r.text as string]));
  const by = new Map<string, Row[]>();
  for (const r of rows) {
    const k = `${r.taskId}:${r.ruleId}`;
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const out: CheckView[] = [];
  for (const group of by.values()) {
    const newest = (rs: Row[]) => rs.sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime())[0];
    const mine = group.filter((r) => r.scorer === "user");
    const pick = mine.length ? newest(mine) : newest(group.filter((r) => r.scorer !== "user"));
    out.push({
      taskId: pick.taskId as string,
      ruleId: pick.ruleId as string,
      ruleText: text.get(pick.ruleId as string) ?? "(a rule you deleted)",
      verdict: pick.verdict as Verdict,
      scorer: pick.scorer as CheckView["scorer"],
      at: pick.createdAt as Date,
      needsAnswer: pick.verdict === "uncertain" && pick.scorer !== "user",
    });
  }
  return out;
}

export interface ScoreSummary {
  score: AdherenceScore;
  tasksLogged14d: number;
  needsAnswer: number;
}

/** What the Home screen shows: the score (null percent = still learning), how many tasks the coverage note counts, how many need an answer. */
export async function scoreSummary(db: Db, userId: string, now = new Date()): Promise<ScoreSummary> {
  const t = tenantDb(db, userId);
  const checks = await currentChecks(db, userId);
  const tasks = (await t.tasks.list()) as Row[];
  const since = now.getTime() - 14 * 24 * 3600 * 1000;
  return {
    score: adherenceScore(checks.map((c) => ({ verdict: c.verdict, at: c.at, taskId: c.taskId })), now),
    tasksLogged14d: tasks.filter((r) => (r.occurredAt as Date).getTime() >= since).length,
    needsAnswer: checks.filter((c) => c.needsAnswer).length,
  };
}
