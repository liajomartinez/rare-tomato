import { after } from "next/server";
import { careSheet, type CareSheetOptions } from "@/lib/care-sheet";
import { resolveOAuthConnection } from "@/lib/connections";
import { masterKeysFromEnv } from "@/lib/crypto";
import { agentsAdmin } from "@/lib/agents-admin";
import { acceptTerms, attestAdult, findOrCreateUser } from "@/lib/identity";
import { anthropicClient } from "@/lib/claude";
import { gatedClient, modelCallsEnabled } from "@/lib/model-gate";
import { feedbackService } from "@/lib/feedback";
import { profileService } from "@/lib/profile";
import { ruleWriter } from "@/lib/rule-writer";
import { rulesService } from "@/lib/rules";
import { makeServices } from "@/lib/services";
import { tasksService } from "@/lib/tasks";
import { auditEntries } from "@/lib/audit-view";
import { exportAll } from "@/lib/data-export";
import { authSubjectOf, hardDeleteAccount, hardDeleteRule, hardDeleteTask } from "./purge";
import { resolveBearerToken } from "@/lib/tokens";
import { jevConfigured } from "@/lib/scoring/config";
import { currentChecks, recordUserVerdict, scoreSummary, scoreTask } from "@/lib/scoring/run";
import { jevScorer } from "@/lib/scoring/scorers";
import { freshness, type Verdict } from "@/lib/scoring/verdict";
import { getDb, type Db } from "./client";
import { clearDeletedMark, jevEnabled } from "./system";
import { logSafeError } from "@/lib/safe-log";

// The only bridge from the website and the live endpoint to the real database.
// Everything here works on one person at a time.

export function resolveWithProductionDb(input: { authSubject: string; clientId: string; email?: string }) {
  return resolveOAuthConnection(getDb(), input);
}

export function resolveBearerWithProductionDb(token: string) {
  return resolveBearerToken(getDb(), token);
}

export function productionServices() {
  return makeServices(getDb(), masterKeysFromEnv(), undefined, (userId, taskId) => {
    // After the reply: Next runs this once the response has been sent. Outside a request there is no "after", and the task stays unscored.
    after(() => scoreInBackground(userId, taskId));
  });
}

/** Scores one task with Claude Haiku (and Jev only if it is switched on). Every model call goes through the gate. Never throws. */
export async function scoreInBackground(userId: string, taskId: string): Promise<void> {
  try {
    const db = getDb();
    const model = gatedClient(db, userId, anthropicClient());
    const jev = jevConfigured() && (await jevEnabled(db)) ? jevScorer({ apiKey: process.env.TYPESAFE_API_KEY as string }) : undefined;
    await scoreTask(db, masterKeysFromEnv(), userId, taskId, { model, jev });
  } catch (error) {
    logSafeError(error, "production");
    // Scoring is advisory and best-effort. A failure leaves the task unscored; it is never reported to the agent.
  }
}

export function personForSignIn(input: { authSubject: string; email?: string | null }) {
  return findOrCreateUser(getDb(), input);
}

/** A fresh sign-in finished: the person chose to come back, so a deleted-account mark for this sign-in id is lifted. */
export function freshSignIn(authSubject: string) {
  return clearDeletedMark(getDb(), authSubject);
}

export function acceptTermsFor(userId: string) {
  return acceptTerms(getDb(), userId);
}

export function attestPerson(userId: string) {
  return attestAdult(getDb(), userId);
}

/** For the website's server code: the profile service for one signed-in person. */
export function profileFor(userId: string) {
  return profileService(getDb(), masterKeysFromEnv(), userId);
}

/** For the website's server code: the feed for one signed-in person. */
export function tasksFor(userId: string) {
  return tasksService(getDb(), masterKeysFromEnv(), userId);
}

/** For the website's server code: feedback on tasks for one signed-in person. */
export function feedbackFor(userId: string) {
  return feedbackService(getDb(), masterKeysFromEnv(), userId);
}

/** For the website's server code: the care sheet text for one signed-in person (spec FR-G2). */
export function careSheetFor(userId: string, opts: CareSheetOptions) {
  return careSheet(getDb(), masterKeysFromEnv(), userId, opts);
}

/** For the website's server code: the score and verdicts for one signed-in person. */
export function scoringFor(userId: string) {
  const db = getDb();
  return {
    summary: () => scoreSummary(db, userId),
    checks: () => currentChecks(db, userId),
    answer: (taskId: string, ruleId: string, verdict: Verdict) => recordUserVerdict(db, userId, taskId, ruleId, verdict),
    freshness: async () => freshness(await profileService(db, masterKeysFromEnv(), userId).list()),
    modelCallsOn: () => modelCallsEnabled(db),
  };
}

/** For the website's server code: one person's rules (list, approve, edit, lock, turn down). */
export function rulesFor(userId: string) {
  return rulesService(getDb(), userId);
}

/** For the website's server code: the rule writer, which calls Claude. Needs ANTHROPIC_API_KEY. Every call goes through the gate (kill switch and spending limits). */
export function ruleWriterFor(userId: string) {
  return ruleWriter(getDb(), masterKeysFromEnv(), userId, gatedClient(getDb(), userId, anthropicClient()));
}

/** For the website's server code: the data controls for one signed-in person (export, audit log, deleting things, deleting the account). */
export function dataFor(userId: string) {
  const db = getDb();
  return {
    exportAll: () => exportAll(db, masterKeysFromEnv(), userId),
    audit: (limit?: number) => auditEntries(db, userId, limit),
    deleteTask: (taskId: string) => hardDeleteTask(db, userId, taskId),
    deleteRule: (ruleId: string) => hardDeleteRule(db, userId, ruleId),
    deleteAccount: () => hardDeleteAccount(db, userId),
    authSubject: () => authSubjectOf(db, userId),
  };
}

/** For the website's server code: the Agents screen actions for one signed-in person. */
export function agentsFor(userId: string) {
  return agentsAdmin(getDb(), userId);
}

/** For the website's server code: run a piece of database work for the pages. Keep the work small and per-person. */
export function withDb<T>(work: (db: Db) => Promise<T>): Promise<T> {
  return work(getDb());
}
