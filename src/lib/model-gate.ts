import type { Db } from "@/db/client";
import { getFlag, monthlyModelSpend, personFlag, setFlag } from "@/db/system";
import type { ModelClient } from "./claude";
import { logSafeError } from "./safe-log";

// The gate every Claude call goes through (spec 6.8, FR-I1, SEC-8). It can say no, and then NOTHING is sent to the model:
//   - the kill switch, flipped by the operator without a deploy (a flag in the database);
//   - a global monthly budget (at 100% calls stop; the person's feedback is still saved);
//   - a per-person monthly spend limit.
// The monthly cap on rule proposals (50) is separate and lives in the rule writer. The limits below are config, and the
// budget amount is still Lia's decision (open items): the default is only the suggested figure.

export const MODEL_SWITCH_KEY = "model_calls_enabled";
export const DEFAULT_MONTHLY_BUDGET_USD = 50;
export const DEFAULT_PERSON_MONTHLY_LIMIT_USD = 1; // the spec's worst case is about $0.50 per person per month
export const ALERT_LEVELS = [0.5, 0.8, 1] as const;

export const PERSON_MODEL_OFF_FLAG = "modelCallsDisabled";
export type GateReason = "switched_off" | "person_switched_off" | "budget_reached" | "person_limit_reached";
export class ModelCallsStopped extends Error {
  constructor(readonly reason: GateReason) {
    super(`Model calls are stopped: ${reason}`);
  }
}

export interface GateLimits {
  monthlyBudgetUsd: number;
  personMonthlyLimitUsd: number;
}
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): GateLimits {
  const num = (v: string | undefined, d: number) => (v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : d);
  return { monthlyBudgetUsd: num(env.MODEL_MONTHLY_BUDGET_USD, DEFAULT_MONTHLY_BUDGET_USD), personMonthlyLimitUsd: num(env.MODEL_PERSON_MONTHLY_LIMIT_USD, DEFAULT_PERSON_MONTHLY_LIMIT_USD) };
}

/** Switched on unless someone has explicitly switched it off. A missing flag means on. */
export async function modelCallsEnabled(db: Db): Promise<boolean> {
  return (await getFlag<boolean>(db, MODEL_SWITCH_KEY)) !== false;
}
export const setModelCallsEnabled = (db: Db, on: boolean) => setFlag(db, MODEL_SWITCH_KEY, on);

/** Why a call from this person right now would be refused, or null if it may go ahead. */
export async function stopReason(db: Db, userId: string, limits: GateLimits = limitsFromEnv(), now = new Date()): Promise<GateReason | null> {
  if (!(await modelCallsEnabled(db))) return "switched_off";
  if (await personFlag(db, userId, PERSON_MODEL_OFF_FLAG)) return "person_switched_off";
  const month = now.toISOString().slice(0, 7);
  if ((await monthlyModelSpend(db, month)) >= limits.monthlyBudgetUsd) return "budget_reached";
  if ((await monthlyModelSpend(db, month, userId)) >= limits.personMonthlyLimitUsd) return "person_limit_reached";
  return null;
}

/** The highest alert level (50%, 80%, 100% of the monthly budget) the spend has reached, and whether it is new this month. */
export async function budgetAlert(db: Db, limits: GateLimits = limitsFromEnv(), now = new Date()): Promise<{ level: number | null; spentUsd: number; isNew: boolean }> {
  const month = now.toISOString().slice(0, 7);
  const spent = await monthlyModelSpend(db, month);
  const reached = limits.monthlyBudgetUsd > 0 ? ALERT_LEVELS.filter((l) => spent >= limits.monthlyBudgetUsd * l) : [];
  const level = reached.length ? reached[reached.length - 1] : null;
  const key = `budget_alert_level_${month}`;
  const before = await getFlag<number>(db, key);
  const isNew = level !== null && (before ?? 0) < level;
  if (isNew) await setFlag(db, key, level); // a later job can read this to send the alert; sending is not built yet
  return { level, spentUsd: spent, isNew };
}

/** Wraps a model client so that every call is checked first. A refused call throws and sends nothing. */
export function gatedClient(db: Db, userId: string, inner: ModelClient, limits: GateLimits = limitsFromEnv()): ModelClient {
  return {
    async complete(request) {
      const reason = await stopReason(db, userId, limits);
      if (reason) throw new ModelCallsStopped(reason);
      const reply = await inner.complete(request);
      await budgetAlert(db, limits).catch((error) => { logSafeError(error, "model-gate"); return undefined; }); // never lets bookkeeping break a call that already worked
      return reply;
    },
  };
}
