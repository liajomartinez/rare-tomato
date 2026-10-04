import type { Db } from "@/db/client";
import { tenantDb, type Row } from "@/db/tenant";
import { decryptField, encryptField, type MasterKeys } from "./crypto";
import { firstReject } from "./blocked-data";
import { currentFeedback } from "./feedback";
import { getDataKey } from "./identity";
import { sanitizeText } from "./sanitize";
import { logSafeError } from "./safe-log";

// What agents record about their own work (spec section 5.3). Everything here is AGENT-REPORTED: it is what the
// agent chose to tell us, not something we verified. The text is untrusted and is cleaned before it is stored.

export const TASK_CATEGORIES = ["scheduling", "messaging", "purchasing", "booking", "research", "admin", "other"] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];
export const TASK_OUTCOMES = ["completed", "failed", "needs_user"] as const;
export type TaskOutcome = (typeof TASK_OUTCOMES)[number];

/** Free-beta cap on task logs per person per month (FR-I1). */
export const MONTHLY_TASK_CAP = 500;
export const LIMITS = { externalId: 128, summary: 500, details: 4096, rules: 20, ruleId: 64 } as const;

/** Shown in place of a summary that could not be decrypted, so one bad row never breaks the whole feed. */
export const UNREADABLE_SUMMARY = "(this summary could not be read)";

/**
 * The task summary as plain text, for the OWNER or for our own processing inside the service (never logged, never stored readable).
 * New rows hold it only encrypted (`task.summary`, spec SEC-5). Rows from before the backfill still have the legacy readable
 * column, so both are read until every row is encrypted.
 */
export function readSummary(row: Row, key: Buffer | undefined, userId: string): string {
  if (row.summaryEncrypted) {
    if (!key) return UNREADABLE_SUMMARY;
    try {
      return decryptField(key, row.summaryEncrypted as string, userId, "task.summary");
    } catch (error) {
      logSafeError(error, "tasks");
      return UNREADABLE_SUMMARY;
    }
  }
  return typeof row.summary === "string" ? row.summary : "";
}

export interface LogTaskInput {
  externalId: unknown;
  summary: unknown;
  category: unknown;
  details?: unknown;
  rulesConsulted?: unknown;
  outcome?: unknown;
  occurredAt?: unknown;
}

export type LogTaskResult =
  | { ok: true; taskId: string; status: "created" | "duplicate" | "updated" }
  | { ok: false; reason: "invalid_input" | "cap_reached"; message: string };

const monthKey = (d: Date) => d.toISOString().slice(0, 7);
const isCategory = (v: unknown): v is TaskCategory => (TASK_CATEGORIES as readonly string[]).includes(v as string);
const isOutcome = (v: unknown): v is TaskOutcome => (TASK_OUTCOMES as readonly string[]).includes(v as string);
const invalid = (message: string): LogTaskResult => ({ ok: false, reason: "invalid_input", message });

export interface TaskView {
  id: string;
  connectionId: string;
  agentName: string;
  summary: string;
  category: string;
  outcome: TaskOutcome | null;
  rulesConsulted: string[];
  occurredAt: Date;
  hasFeedback: boolean;
  /** The person's current rating, if they gave one. */
  rating?: "up" | "down";
  /** Only filled in when asked for. */
  details?: string;
}

export function tasksService(db: Db, masters: MasterKeys, userId: string) {
  const t = tenantDb(db, userId);

  return {
    /**
     * Records one task for one agent connection. Sending the same external id again never duplicates:
     * it returns the same task, and if only the outcome changed it updates that (FR-C1, FR-C4).
     */
    async logTask(connectionId: string, input: LogTaskInput, now = new Date()): Promise<LogTaskResult> {
      const externalId = sanitizeText(input.externalId, LIMITS.externalId);
      const summary = sanitizeText(input.summary, LIMITS.summary);
      if (!externalId) return invalid("Give this task a unique id (1 to 128 characters).");
      if (!summary) return invalid("Give a short summary of what you did (1 to 500 characters).");
      if (!isCategory(input.category)) return invalid(`Category must be one of: ${TASK_CATEGORIES.join(", ")}.`);
      if (input.outcome !== undefined && !isOutcome(input.outcome)) return invalid(`Outcome must be one of: ${TASK_OUTCOMES.join(", ")}.`);
      const details = input.details === undefined ? null : sanitizeText(input.details, LIMITS.details) || null;
      const blocked = firstReject([summary, details].filter(Boolean).join(" "));
      if (blocked) return invalid(blocked.message + " Leave it out of the task record and send it again.");
      const rules = Array.isArray(input.rulesConsulted)
        ? input.rulesConsulted.slice(0, LIMITS.rules).map((r) => sanitizeText(r, LIMITS.ruleId)).filter(Boolean)
        : [];
      let occurredAt = now;
      if (input.occurredAt !== undefined) {
        const parsed = new Date(String(input.occurredAt));
        if (Number.isNaN(parsed.getTime())) return invalid("occurred_at must be a date and time such as 2026-10-01T15:00:00Z.");
        occurredAt = parsed.getTime() > now.getTime() ? now : parsed; // never in the future
      }

      const existing = ((await t.tasks.find({ agentConnectionId: connectionId, externalId })) as Row[])[0];
      if (existing) return this.repeat(existing, input.outcome as TaskOutcome | undefined);

      const month = monthKey(now);
      if ((await t.usage(month)).taskLogs >= MONTHLY_TASK_CAP) {
        return { ok: false, reason: "cap_reached", message: `The limit is ${MONTHLY_TASK_CAP} task records a month. This one was not saved.` };
      }

      const key = await getDataKey(db, userId, masters);
      let row: Row;
      try {
        row = await t.tasks.insert({
          agentConnectionId: connectionId,
          externalId,
          // The summary is stored ONLY encrypted. The legacy readable column stays empty for new rows.
          summaryEncrypted: encryptField(key, summary, userId, "task.summary"),
          category: input.category,
          detailsEncrypted: details ? encryptField(key, details, userId, "task.details") : null,
          outcome: input.outcome ?? null,
          rulesConsulted: rules,
          occurredAt,
        });
      } catch (error) {
        logSafeError(error, "tasks");
        // Two identical calls at once: the database refused the second. Treat it as a repeat of the first.
        const raced = ((await t.tasks.find({ agentConnectionId: connectionId, externalId })) as Row[])[0];
        if (raced) return this.repeat(raced, input.outcome as TaskOutcome | undefined);
        throw new Error("Could not save the task");
      }
      await t.incrementUsage(month, "taskLogs");
      return { ok: true, taskId: row.id as string, status: "created" };
    },

    async repeat(existing: Row, outcome: TaskOutcome | undefined): Promise<LogTaskResult> {
      if (outcome && existing.outcome !== outcome) {
        await t.tasks.update(existing.id as string, { outcome });
        return { ok: true, taskId: existing.id as string, status: "updated" };
      }
      return { ok: true, taskId: existing.id as string, status: "duplicate" };
    },

    /**
     * One task, for code that needs its summary as quoted data (for example the rule writer). The summary is decrypted here, inside
     * the service, for processing; it is never logged or stored readable. Anything that sends it onward (for example scoring,
     * spec 6.5) must redact it first.
     */
    async get(taskId: string): Promise<{ id: string; connectionId: string; summary: string; category: string } | null> {
      const r = await t.tasks.get(taskId).catch((error) => { logSafeError(error, "tasks"); return null; });
      if (!r) return null;
      const key = r.summaryEncrypted ? await getDataKey(db, userId, masters) : undefined;
      return { id: r.id as string, connectionId: r.agentConnectionId as string, summary: readSummary(r, key, userId), category: r.category as string };
    },

    /** How many of the agents' task records the person has not rated yet (for the Home screen). Only the person's own ratings count. */
    async reviewCount(): Promise<number> {
      const [rows, feedback] = await Promise.all([t.tasks.list() as Promise<Row[]>, t.feedback.list() as Promise<Row[]>]);
      const reviewed = new Set(feedback.filter((f) => f.source !== "agent_reported").map((f) => f.taskId as string));
      return rows.filter((r) => !reviewed.has(r.id as string)).length;
    },

    /** The feed (FR-C2): newest first. Filters are optional. Details are decrypted only when asked for. */
    async feed(
      opts: { connectionId?: string; category?: string; notReviewed?: boolean; before?: Date; limit?: number; withDetails?: boolean } = {},
    ): Promise<TaskView[]> {
      const [rows, connections, feedback] = await Promise.all([
        t.tasks.list() as Promise<Row[]>,
        t.agentConnections.list() as Promise<Row[]>,
        t.feedback.list() as Promise<Row[]>,
      ]);
      const names = new Map(connections.map((c) => [c.id as string, c.name as string]));
      // Only the person's own feedback counts as reviewing or rating a task, never what an agent reported on their behalf.
      const own = feedback.filter((f) => f.source !== "agent_reported");
      const reviewed = new Set(own.map((f) => f.taskId as string));
      const ratings = currentFeedback(own);
      const picked = rows
        .filter((r) => !opts.connectionId || r.agentConnectionId === opts.connectionId)
        .filter((r) => !opts.category || r.category === opts.category)
        .filter((r) => !opts.notReviewed || !reviewed.has(r.id as string))
        .filter((r) => !opts.before || (r.occurredAt as Date) < opts.before)
        .sort((a, b) => (b.occurredAt as Date).getTime() - (a.occurredAt as Date).getTime())
        .slice(0, opts.limit ?? 50);
      // Decrypted only for the signed-in owner, and only when there is something encrypted to read (spec FR-C2).
      const key = opts.withDetails || picked.some((r) => r.summaryEncrypted) ? await getDataKey(db, userId, masters) : undefined;
      return picked.map<TaskView>((r) => ({
        id: r.id as string,
        connectionId: r.agentConnectionId as string,
        agentName: names.get(r.agentConnectionId as string) ?? "An agent you removed",
        summary: readSummary(r, key, userId),
        category: r.category as string,
        outcome: (r.outcome as TaskOutcome | null) ?? null,
        rulesConsulted: (r.rulesConsulted as string[]) ?? [],
        occurredAt: r.occurredAt as Date,
        hasFeedback: reviewed.has(r.id as string),
        rating: ratings.get(r.id as string)?.rating as "up" | "down" | undefined,
        details: key && r.detailsEncrypted ? decryptField(key, r.detailsEncrypted as string, userId, "task.details") : undefined,
      }));
    },
  };
}

export type TasksService = ReturnType<typeof tasksService>;
