// Scoring settings. Config, not constants buried in code (spec FR-F2, 6.5): the cut-offs, the tomato stages and the model names live here and can be
// overridden by environment variables, so Lia's golden-set results (M7) can change them without touching the logic.
//
// The band WORDS are Lia's decision (O2, Set C, 2026-10-03) and live in src/lib/strings.ts. The cut-off values themselves were designed
// around Jev's probabilities and are PROVISIONAL for the Haiku scorer until golden set B has been labeled and run (SPEC 12.2).
import { SCORE_BAND_LABELS } from "../strings";

export interface Thresholds {
  /** applies below this: not_applicable */
  notApplicableBelow: number;
  /** applies at least the line above and violated at least this: violated */
  violatedAtLeast: number;
  /** applies at least the line above and violated at most this: followed */
  followedAtMost: number;
}

/** SPEC 6.5 starting values. */
export const DEFAULT_THRESHOLDS: Thresholds = { notApplicableBelow: 0.3, violatedAtLeast: 0.7, followedAtMost: 0.3 };

export function thresholdsFromEnv(env: Record<string, string | undefined> = process.env): Thresholds {
  try {
    const raw = env.SCORING_THRESHOLDS ? JSON.parse(env.SCORING_THRESHOLDS) : {};
    const pick = (k: keyof Thresholds) => (typeof raw[k] === "number" && raw[k] >= 0 && raw[k] <= 1 ? (raw[k] as number) : DEFAULT_THRESHOLDS[k]);
    return { notApplicableBelow: pick("notApplicableBelow"), violatedAtLeast: pick("violatedAtLeast"), followedAtMost: pick("followedAtMost") };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
}

export const MIN_SCORED_VERDICTS = 5;
/** The design's rule (owner decision 4, 2026-10-04): a number is shown only once an agent has reported at least this many tasks (and enough of them could be checked). */
export const MIN_REPORTED_TASKS = 5;
export const SCORE_WINDOW_DAYS = 14;
export const MAX_CANDIDATE_RULES = 5;

/**
 * The tomato stages (SPEC 6.6): five fixed still scored stages (stage 0, "Still learning", has no number and no tomato). The words come from
 * strings.ts (O2, Set C); the cut points are placeholders until golden set B is labeled.
 */
export const TOMATO_STAGES: { from: number; label: string; fill: string }[] = [
  { from: 0, label: SCORE_BAND_LABELS[1], fill: "var(--rt-tomato-1)" },
  { from: 25, label: SCORE_BAND_LABELS[2], fill: "var(--rt-tomato-2)" },
  { from: 50, label: SCORE_BAND_LABELS[3], fill: "var(--rt-tomato-3)" },
  { from: 75, label: SCORE_BAND_LABELS[4], fill: "var(--rt-tomato-4)" },
  { from: 90, label: SCORE_BAND_LABELS[5], fill: "var(--rt-tomato-5)" },
];

export const MODELS_SCORING = {
  claude: process.env.SCORE_MODEL || "claude-haiku-4-5-20251001",
  /** Pinned on purpose; never the moving "latest" alias (SPEC 8.3). */
  jev: process.env.JEV_MODEL || "jev-1.13.0",
} as const;

/** Jev stays OFF until TypeSafe has answered in writing about retention and training (decision D12). Needs JEV_ENABLED=true AND the key. */
export const jevConfigured = (env: Record<string, string | undefined> = process.env) => env.JEV_ENABLED === "true" && Boolean(env.TYPESAFE_API_KEY);
