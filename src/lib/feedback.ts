import type { Db } from "@/db/client";
import { tenantDb, type Row } from "@/db/tenant";
import { decryptField, encryptField, type MasterKeys } from "./crypto";
import { firstReject } from "./blocked-data";
import { getDataKey } from "./identity";
import { REASONS } from "./feedback-reasons";
import { sanitizeText } from "./sanitize";
import { logSafeError } from "./safe-log";

export { REASONS };
const REASON_CODES = REASONS.map((r) => r.code);

// The person's own verdict on a task (spec FR-D1 to FR-D6). Feedback is never edited: a newer record
// replaces an older one by pointing at it (supersedes_id), so the history stays. The note is stored encrypted.

export const RATINGS = ["up", "down"] as const;
export type Rating = (typeof RATINGS)[number];

export const NOTE_LIMIT = 1000;

export interface FeedbackInput {
  taskId: unknown;
  rating: unknown;
  reasonCodes?: unknown;
  note?: unknown;
  /** "agent_reported" only from the propose_correction path; anything else means the person gave it themselves. */
  source?: unknown;
}

export interface FeedbackView {
  id: string;
  taskId: string;
  rating: Rating;
  reasonCodes: string[];
  /** "agent_reported": an agent passed on what the person said. It is not the person's own words and is not their rating. */
  source: "person" | "agent_reported";
  /** Only when asked for, and only ever for the owner. */
  note?: string;
  createdAt: Date;
}

export type FeedbackResult =
  | { ok: true; feedback: FeedbackView }
  | { ok: false; reason: "invalid_input" | "not_found"; message: string };

const bad = (message: string): FeedbackResult => ({ ok: false, reason: "invalid_input", message });

/** The newest record for each task: the one no other record replaces. */
export function currentFeedback(rows: Row[]): Map<string, Row> {
  const replaced = new Set(rows.map((r) => r.supersedesId).filter(Boolean) as string[]);
  const out = new Map<string, Row>();
  for (const r of rows) if (!replaced.has(r.id as string)) out.set(r.taskId as string, r);
  return out;
}

export function feedbackService(db: Db, masters: MasterKeys, userId: string) {
  const t = tenantDb(db, userId);

  const view = (r: Row, note?: string): FeedbackView => ({
    id: r.id as string,
    taskId: r.taskId as string,
    rating: r.rating as Rating,
    reasonCodes: (r.reasonCodes as string[]) ?? [],
    source: r.source === "agent_reported" ? "agent_reported" : "person",
    note,
    createdAt: r.createdAt as Date,
  });

  return {
    /**
     * Saves the person's rating for a task. If they already rated it, the new record replaces the old one;
     * the old one is kept. Reasons and a note only belong with a 👎 (a 👍 keeps neither).
     */
    async submit(input: FeedbackInput): Promise<FeedbackResult> {
      if (!(RATINGS as readonly string[]).includes(input.rating as string)) return bad("Choose Good or Not right.");
      if (typeof input.taskId !== "string") return bad("Missing task.");
      const rating = input.rating as Rating;

      const codes = Array.isArray(input.reasonCodes) ? input.reasonCodes : [];
      if (codes.some((c) => !REASON_CODES.includes(c as string))) return bad("Unknown reason.");
      const reasonCodes = rating === "down" ? [...new Set(codes as string[])] : [];
      const note = rating === "down" ? sanitizeText(input.note, NOTE_LIMIT) : "";

      const blocked = note ? firstReject(note) : null;
      if (blocked) return bad(blocked.message);

      const task = await t.tasks.get(input.taskId).catch((error) => { logSafeError(error, "feedback"); return null; });
      if (!task) return { ok: false, reason: "not_found", message: "We could not find that task." };

      const agentReported = input.source === "agent_reported";
      // A person's rating replaces only the person's earlier rating, and an agent's report never replaces anyone's record.
      const all = ((await t.feedback.find({ taskId: input.taskId })) as Row[]).filter((r) => r.source !== "agent_reported");
      const previous = agentReported ? undefined : currentFeedback(all).get(input.taskId);

      const key = note ? await getDataKey(db, userId, masters) : undefined;
      const row = await t.feedback.insert({
        taskId: input.taskId,
        rating,
        reasonCodes,
        noteEncrypted: key ? encryptField(key, note, userId, "feedback.note") : null,
        source: input.source === "agent_reported" ? "agent_reported" : "person",
        supersedesId: previous ? (previous.id as string) : null,
      });
      return { ok: true, feedback: view(row, note || undefined) };
    },

    /** One record with its note decrypted, for the owner's own pipeline (the rule writer). */
    async getWithNote(feedbackId: string): Promise<FeedbackView | null> {
      const r = await t.feedback.get(feedbackId).catch((error) => { logSafeError(error, "feedback"); return null; });
      if (!r) return null;
      const key = r.noteEncrypted ? await getDataKey(db, userId, masters) : undefined;
      return view(r, key ? decryptField(key, r.noteEncrypted as string, userId, "feedback.note") : undefined);
    },

    /** The current rating for each task (newest record only). The note is decrypted only when asked for. */
    async current(opts: { withNotes?: boolean } = {}): Promise<Map<string, FeedbackView>> {
      // The person's own ratings only; an agent's report is shown separately where it matters.
      const rows = ((await t.feedback.list()) as Row[]).filter((r) => r.source !== "agent_reported");
      const key = opts.withNotes ? await getDataKey(db, userId, masters) : undefined;
      const out = new Map<string, FeedbackView>();
      for (const [taskId, r] of currentFeedback(rows)) {
        out.set(taskId, view(r, key && r.noteEncrypted ? decryptField(key, r.noteEncrypted as string, userId, "feedback.note") : undefined));
      }
      return out;
    },

    /** Every record, oldest first, so the history can be shown. No notes. */
    async history(taskId: string): Promise<FeedbackView[]> {
      const rows = (await t.feedback.find({ taskId })) as Row[];
      return rows.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime()).map((r) => view(r));
    },
  };
}
