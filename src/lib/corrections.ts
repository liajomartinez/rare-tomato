import { createHash } from "node:crypto";
import type { Db } from "@/db/client";
import { tenantDb, type Row } from "@/db/tenant";
import type { ModelClient } from "./claude";
import type { MasterKeys } from "./crypto";
import { feedbackService } from "./feedback";
import { ruleWriter } from "./rule-writer";
import { sanitizeText } from "./sanitize";
import { tasksService, TASK_CATEGORIES } from "./tasks";

// `propose_correction`: an agent passes along a correction the person just gave it in conversation (spec 7.3, FR-E1).
// What this does and does NOT do:
//   - It saves the report as feedback marked "agent_reported". That text is the AGENT's account of what the person said:
//     it is not the person's own words and it is never counted as the person's own rating.
//   - It may create a PROPOSED rule, through the same rule writer and the same checks as a thumbs-down. The person must
//     still approve it on Your rules, where it is labeled as coming from the agent. An agent can never approve anything.
//   - It tells the agent only a status, never the text of any rule or any detail about the person.

export const CORRECTIONS_PER_CONNECTION_PER_DAY = 5;
export const USER_SAID_LIMIT = 500;

export type CorrectionStatus = "queued" | "cap_reached" | "rejected";
export interface CorrectionResult {
  proposal_status: CorrectionStatus;
  message: string;
}
export interface CorrectionInput {
  userSaid: unknown;
  category: unknown;
  taskExternalId?: unknown;
}

const reject = (message: string): CorrectionResult => ({ proposal_status: "rejected", message });
const words = (s: string) => (s.match(/[A-Za-z0-9$']{2,}/g) ?? []).length;

export async function proposeCorrection(
  db: Db,
  masters: MasterKeys,
  userId: string,
  connectionId: string,
  input: CorrectionInput,
  model: ModelClient,
  now = new Date(),
): Promise<CorrectionResult> {
  const t = tenantDb(db, userId);
  const userSaid = sanitizeText(input.userSaid, USER_SAID_LIMIT);
  if (!userSaid || words(userSaid) < 3) return reject(`Pass along what the person said, in their own words (3 to ${USER_SAID_LIMIT} characters).`);
  if (!(TASK_CATEGORIES as readonly string[]).includes(input.category as string)) return reject(`Category must be one of: ${TASK_CATEGORIES.join(", ")}.`);
  const category = input.category as string;

  // Which task does this correction belong to? One of this agent's own tasks if it named one, otherwise a new entry.
  let taskId: string | undefined;
  const named = typeof input.taskExternalId === "string" ? sanitizeText(input.taskExternalId, 128) : "";
  if (named) {
    const found = ((await t.tasks.find({ agentConnectionId: connectionId, externalId: named })) as Row[])[0];
    if (found) taskId = found.id as string;
  }

  if (!taskId) {
    const externalId = `correction-${createHash("sha256").update(`${connectionId}|${category}|${userSaid}`).digest("hex").slice(0, 16)}`;
    // The same report sent twice (a retry) is recognised and not processed again.
    const duplicate = ((await t.tasks.find({ agentConnectionId: connectionId, externalId })) as Row[])[0];
    if (duplicate) return { proposal_status: "queued", message: "Already received. Nothing more was done." };

    const since = now.getTime() - 24 * 3600_000;
    const recent = ((await t.tasks.find({ agentConnectionId: connectionId })) as Row[]).filter(
      (r) => String(r.externalId).startsWith("correction-") && (r.createdAt as Date).getTime() >= since,
    );
    if (recent.length >= CORRECTIONS_PER_CONNECTION_PER_DAY) return reject("Too many corrections from this agent today. Try again tomorrow.");

    const logged = await tasksService(db, masters, userId).logTask(connectionId, {
      externalId,
      summary: `Passed on a correction the person gave this agent (agent-reported): "${userSaid}"`,
      category,
      outcome: "completed",
    }, now);
    if (!logged.ok) return reject(logged.message);
    taskId = logged.taskId;
  }

  const saved = await feedbackService(db, masters, userId).submit({ taskId, rating: "down", reasonCodes: ["other"], note: userSaid, source: "agent_reported" });
  if (!saved.ok) return reject("Could not record the correction.");

  const drafted = await ruleWriter(db, masters, userId, model).proposeFromFeedback(saved.feedback.id, now);
  switch (drafted.kind) {
    case "proposed":
      return { proposal_status: "queued", message: "Passed to the person for review in Rare Tomato. Nothing changes unless they approve it." };
    case "cap_reached":
      return { proposal_status: "cap_reached", message: "The person has reached this month's limit of proposed rules, so nothing was proposed." };
    case "needs_more_info":
      return reject("That was not specific enough to turn into a rule, so nothing was proposed.");
    case "paused":
      return reject("Proposing rules is switched off for now, so nothing was proposed.");
    default:
      return reject("Could not propose a rule this time.");
  }
}
