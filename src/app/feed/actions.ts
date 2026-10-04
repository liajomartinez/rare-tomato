"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dataFor, feedbackFor, ruleWriterFor, scoringFor } from "@/db/production";
import { requireReady } from "@/lib/session";
import { DRAFT_FAILED } from "@/lib/strings";
import { proposalUrl } from "@/lib/tap-path";
import { logSafeError } from "@/lib/safe-log";

// The person's id always comes from their sign-in, never from the form.

export interface FeedbackState {
  ok?: boolean;
  message?: string;
}

/** The page to come back to after a thumbs-down: the feed the person was on, with the message shown as a banner (it cannot be lost with the card). */
function backToFeed(returnTo: unknown, message: string): never {
  const base = typeof returnTo === "string" && /^\/feed(\?[\w=&%.:-]*)?$/.test(returnTo) ? returnTo : "/feed";
  const url = new URL(base, "https://rare-tomato.local");
  url.searchParams.set("message", message);
  redirect(`${url.pathname}${url.search}`);
}

/** How long we wait for the drafting model before telling the person we could not draft. */
const DRAFT_TIMEOUT_MS = 25_000;
const timeout = (ms: number) => new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms));

export async function saveFeedback(_previous: FeedbackState, formData: FormData): Promise<FeedbackState> {
  const person = await requireReady();
  const returnTo = formData.get("returnTo");
  const result = await feedbackFor(person.id).submit({
    taskId: formData.get("taskId"),
    rating: formData.get("rating"),
    reasonCodes: formData.getAll("reason"),
    note: formData.get("note") ?? "",
  });
  if (!result.ok) return { message: result.message };
  revalidatePath("/feed");
  if (result.feedback.rating === "up") return { ok: true, message: "Thanks, saved." };

  // The feedback is already saved above, so nothing that goes wrong next can lose it.
  // A thumbs down with at least one reason asks for a draft (spec 6.1; a note is optional, run 7). The draft is only a proposal: it is shown on
  // Your rules and no agent can see it until the person taps Save as a rule. Every outcome below ends on a page with a visible message.
  if (result.feedback.reasonCodes.length === 0) {
    return backToFeed(returnTo, "Saved. Pick a reason and tap \u{1F44E} again if you want a rule drafted.");
  }
  let outcome: Awaited<ReturnType<ReturnType<typeof ruleWriterFor>["proposeFromFeedback"]>> | "timeout" | "error" = "error";
  try {
    outcome = await Promise.race([ruleWriterFor(person.id).proposeFromFeedback(result.feedback.id, new Date(), { inline: true }), timeout(DRAFT_TIMEOUT_MS)]);
  } catch (error) {
    logSafeError(error, "action:feed");
    outcome = "error";
  }
  if (outcome !== "timeout" && outcome !== "error") {
    if (outcome.kind === "proposed") redirect(proposalUrl(outcome.rule.id));
    if (outcome.kind === "cap_reached") return backToFeed(returnTo, `Saved. ${outcome.message}`);
    if (outcome.kind === "paused") {
      return backToFeed(
        returnTo,
        outcome.reason === "switched_off" || outcome.reason === "person_switched_off"
          ? "Saved. Drafting rules is switched off for now, so no rule was drafted."
          : "Saved. Drafting rules is paused for now because a spending limit was reached, so no rule was drafted.",
      );
    }
  }
  return backToFeed(returnTo, `Saved. ${DRAFT_FAILED}`);
}

/** Deletes one task record for good, with the feedback on it (spec FR-H3). */
export async function deleteTaskRecord(formData: FormData) {
  const person = await requireReady();
  await dataFor(person.id).deleteTask(String(formData.get("taskId") ?? ""));
  revalidatePath("/feed");
}

/** The person's one-tap answer to "Was this right?". It overrides the scorers and is recorded as theirs. */
export async function answerCheck(formData: FormData) {
  const person = await requireReady();
  const verdict = String(formData.get("verdict") ?? "");
  if (verdict === "followed" || verdict === "violated" || verdict === "not_applicable") {
    await scoringFor(person.id).answer(String(formData.get("taskId") ?? ""), String(formData.get("ruleId") ?? ""), verdict);
  }
  revalidatePath("/feed");
  revalidatePath("/");
}
