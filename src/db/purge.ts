import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "./client";
import {
  adherenceChecks, agentConnections, auditLog, careSnapshots, consents, feedback, jobs, profileFacts, rules, tasks, usageCounters, users,
} from "./schema";
import { markSubjectDeleted } from "./system";

// Real deletion (spec FR-H2, FR-H3). Everything here removes rows for good, for ONE person, and every statement names that person's id.
// It lives in src/db because it must also reach rows the tenant layer hides (soft-deleted ones) and rows that reference each other.
// A deleted row cannot come back, and nothing here touches another person's rows (tests prove it with two people).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = (db: Db) => db as any;

export type DeleteCounts = Record<string, number>;

async function del(db: Db, table: unknown, where: unknown): Promise<number> {
  const rows: unknown[] = await q(db).delete(table).where(where).returning({ id: (table as { id: unknown }).id });
  return rows.length;
}

/** Deletes one task for good, with the feedback and scoring records that point at it. Returns false if it is not this person's. */
export async function hardDeleteTask(db: Db, userId: string, taskId: string): Promise<boolean> {
  const mine = await q(db).select({ id: tasks.id }).from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  if (!mine.length) return false;
  await del(db, adherenceChecks, and(eq(adherenceChecks.taskId, taskId), eq(adherenceChecks.userId, userId)));
  await del(db, feedback, and(eq(feedback.taskId, taskId), eq(feedback.userId, userId)));
  await del(db, tasks, and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
  return true;
}

/** Deletes one rule for good, with the scoring records that point at it. Returns false if it is not this person's. */
export async function hardDeleteRule(db: Db, userId: string, ruleId: string): Promise<boolean> {
  const mine = await q(db).select({ id: rules.id }).from(rules).where(and(eq(rules.id, ruleId), eq(rules.userId, userId))).limit(1);
  if (!mine.length) return false;
  await del(db, adherenceChecks, and(eq(adherenceChecks.ruleId, ruleId), eq(adherenceChecks.userId, userId)));
  await del(db, rules, and(eq(rules.id, ruleId), eq(rules.userId, userId)));
  return true;
}

/** Deletes one detail for good. Returns false if it is not this person's. */
export async function hardDeleteFact(db: Db, userId: string, factId: string): Promise<boolean> {
  return (await del(db, profileFacts, and(eq(profileFacts.id, factId), eq(profileFacts.userId, userId)))) === 1;
}

/** Removes every row already marked deleted for this person (the purge job for FR-H2). Safe to run any time and more than once. */
export async function purgeSoftDeleted(db: Db, userId: string): Promise<DeleteCounts> {
  const out: DeleteCounts = {};
  const doomedTasks: { id: string }[] = await q(db).select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)));
  const doomedRules: { id: string }[] = await q(db).select({ id: rules.id }).from(rules).where(and(eq(rules.userId, userId), isNotNull(rules.deletedAt)));
  const taskIds = doomedTasks.map((t) => t.id);
  const ruleIds = doomedRules.map((r) => r.id);
  if (taskIds.length) {
    out.adherence_checks = await del(db, adherenceChecks, and(eq(adherenceChecks.userId, userId), inArray(adherenceChecks.taskId, taskIds)));
    out.feedback = await del(db, feedback, and(eq(feedback.userId, userId), inArray(feedback.taskId, taskIds)));
  }
  if (ruleIds.length) {
    out.adherence_checks = (out.adherence_checks ?? 0) + (await del(db, adherenceChecks, and(eq(adherenceChecks.userId, userId), inArray(adherenceChecks.ruleId, ruleIds))));
  }
  out.feedback = (out.feedback ?? 0) + (await del(db, feedback, and(eq(feedback.userId, userId), isNotNull(feedback.deletedAt))));
  out.tasks = await del(db, tasks, and(eq(tasks.userId, userId), isNotNull(tasks.deletedAt)));
  out.rules = await del(db, rules, and(eq(rules.userId, userId), isNotNull(rules.deletedAt)));
  out.profile_facts = await del(db, profileFacts, and(eq(profileFacts.userId, userId), isNotNull(profileFacts.deletedAt)));
  // A removed agent is soft-deleted but its tasks still point at it, so its tasks (and their checks and feedback) go first.
  const doomedConns: { id: string }[] = await q(db).select({ id: agentConnections.id }).from(agentConnections).where(and(eq(agentConnections.userId, userId), isNotNull(agentConnections.deletedAt)));
  const connIds = doomedConns.map((c) => c.id);
  if (connIds.length) {
    const theirTasks: { id: string }[] = await q(db).select({ id: tasks.id }).from(tasks).where(and(eq(tasks.userId, userId), inArray(tasks.agentConnectionId, connIds)));
    const theirTaskIds = theirTasks.map((t) => t.id);
    if (theirTaskIds.length) {
      out.adherence_checks = (out.adherence_checks ?? 0) + (await del(db, adherenceChecks, and(eq(adherenceChecks.userId, userId), inArray(adherenceChecks.taskId, theirTaskIds))));
      out.feedback = (out.feedback ?? 0) + (await del(db, feedback, and(eq(feedback.userId, userId), inArray(feedback.taskId, theirTaskIds))));
      out.tasks = (out.tasks ?? 0) + (await del(db, tasks, and(eq(tasks.userId, userId), inArray(tasks.id, theirTaskIds))));
    }
  }
  out.agent_connections = await del(db, agentConnections, and(eq(agentConnections.userId, userId), isNotNull(agentConnections.deletedAt)));
  return out;
}

/**
 * Deletes the person and everything of theirs, for good (FR-H2): every owned table, including rows already marked deleted, then the
 * account row itself. Children are removed before the rows they point at. Re-running it after a stop finishes the job.
 */
export async function hardDeleteAccount(db: Db, userId: string): Promise<DeleteCounts> {
  const out: DeleteCounts = {};
  // Mark the sign-in id first, so no still-valid token or session can create a new account while (or after) this runs.
  const subject = await authSubjectOf(db, userId);
  if (subject) await markSubjectDeleted(db, subject);
  out.adherence_checks = await del(db, adherenceChecks, eq(adherenceChecks.userId, userId));
  out.feedback = await del(db, feedback, eq(feedback.userId, userId));
  out.care_snapshots = await del(db, careSnapshots, eq(careSnapshots.userId, userId));
  out.usage_counters = await del(db, usageCounters, eq(usageCounters.userId, userId));
  out.audit_log = await del(db, auditLog, eq(auditLog.userId, userId));
  out.consents = await del(db, consents, eq(consents.userId, userId));
  out.jobs = await del(db, jobs, eq(jobs.userId, userId));
  out.tasks = await del(db, tasks, eq(tasks.userId, userId));
  out.rules = await del(db, rules, eq(rules.userId, userId));
  out.profile_facts = await del(db, profileFacts, eq(profileFacts.userId, userId));
  out.agent_connections = await del(db, agentConnections, eq(agentConnections.userId, userId));
  out.users = await del(db, users, eq(users.id, userId));
  return out;
}

/** The sign-in id for a person, needed to ask the sign-in provider to remove its record. Read before the account is deleted. */
export async function authSubjectOf(db: Db, userId: string): Promise<string | null> {
  const rows: { s: string }[] = await q(db).select({ s: users.authSubject }).from(users).where(eq(users.id, userId)).limit(1);
  return rows[0]?.s ?? null;
}
