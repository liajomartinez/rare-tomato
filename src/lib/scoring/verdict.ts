import { DEFAULT_THRESHOLDS, MIN_SCORED_VERDICTS, SCORE_WINDOW_DAYS, TOMATO_STAGES, type Thresholds } from "./config";

// Pure functions: probabilities in, verdict out (spec 6.5), and the care meters (spec 6.6). Everything here is ADVISORY (FR-F4):
// nothing in this file, or any caller of it, blocks, changes or reverses what an agent did.

export type Verdict = "followed" | "violated" | "not_applicable" | "uncertain";

const valid = (p: unknown): p is number => typeof p === "number" && Number.isFinite(p) && p >= 0 && p <= 1;

/**
 * SPEC 6.5 table. A missing, out-of-range or non-numeric probability is `uncertain`, never `followed`: an odd answer from a scorer must
 * never raise a score (injection and failure safety).
 */
export function verdictFor(pApplies: unknown, pViolated: unknown, t: Thresholds = DEFAULT_THRESHOLDS): Verdict {
  if (!valid(pApplies) || !valid(pViolated)) return "uncertain";
  if (pApplies < t.notApplicableBelow) return "not_applicable";
  if (pViolated >= t.violatedAtLeast) return "violated";
  if (pViolated <= t.followedAtMost) return "followed";
  return "uncertain";
}

export interface CheckLike {
  verdict: Verdict;
  at: Date;
  taskId?: string;
}

export interface AdherenceScore {
  /** null while there are too few scored verdicts ("still learning"). */
  percent: number | null;
  followed: number;
  violated: number;
  scored: number;
}

/** 100 x followed / (followed + violated) over the last 14 days; not_applicable and uncertain are ignored (SPEC 6.6). */
export function adherenceScore(checks: CheckLike[], now = new Date()): AdherenceScore {
  const since = now.getTime() - SCORE_WINDOW_DAYS * 24 * 3600 * 1000;
  const recent = checks.filter((c) => c.at.getTime() >= since && c.at.getTime() <= now.getTime() + 60_000);
  const followed = recent.filter((c) => c.verdict === "followed").length;
  const violated = recent.filter((c) => c.verdict === "violated").length;
  const scored = followed + violated;
  return { percent: scored < MIN_SCORED_VERDICTS ? null : Math.round((100 * followed) / scored), followed, violated, scored };
}

export interface TomatoView {
  stageIndex: number;
  label: string;
  fill: string;
}

/** The tomato stage for a percentage, from the configured cut points. Always shown with the number and the word (never color alone). */
export function tomatoFor(percent: number): TomatoView {
  let index = 0;
  TOMATO_STAGES.forEach((s, i) => {
    if (percent >= s.from) index = i;
  });
  return { stageIndex: index, label: TOMATO_STAGES[index].label, fill: TOMATO_STAGES[index].fill };
}

/** Freshness: the share of details reviewed or edited in the last 90 days (SPEC 6.6). null when there are no details. */
export function freshness(facts: { lastReviewedAt: Date | null }[], now = new Date()): number | null {
  if (facts.length === 0) return null;
  const since = now.getTime() - 90 * 24 * 3600 * 1000;
  return Math.round((100 * facts.filter((f) => f.lastReviewedAt && f.lastReviewedAt.getTime() >= since).length) / facts.length);
}
