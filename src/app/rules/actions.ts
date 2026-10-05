"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { dataFor, rulesFor } from "@/db/production";
import { requireReady } from "@/lib/session";
import { NOT_NOW_BANNER, SAVED_AS_RULE_BANNER } from "@/lib/strings";

// The person's id always comes from their sign-in, never from the form. Every change below is made by the person,
// on purpose, and is recorded as their approval. Nothing here runs without a tap from them (spec FR-E5).

const text = (f: FormData, key: string) => String(f.get(key) ?? "");
const done = (message: string, savedId?: string): never => {
  revalidatePath("/rules");
  // savedId: the rule just saved, so the page can show it and scroll to it instead of letting it quietly disappear from the Waiting list.
  redirect(`/rules?message=${encodeURIComponent(message)}${savedId ? `&saved=${encodeURIComponent(savedId)}#rule-${encodeURIComponent(savedId)}` : ""}`);
};

export async function approveRule(formData: FormData) {
  const person = await requireReady();
  const id = text(formData, "id");
  const result = await rulesFor(person.id).approve(id);
  if (!result.ok) done(result.message);
  done(SAVED_AS_RULE_BANNER, id);
}

/** "Not now": the proposed rule is deleted for good. It is not kept as pending or as history, and no agent ever saw it (run 7). */
export async function discardDraft(formData: FormData) {
  const person = await requireReady();
  const result = await rulesFor(person.id).discard(text(formData, "id"));
  done(result.ok ? NOT_NOW_BANNER : result.message);
}

export async function retireRule(formData: FormData) {
  const person = await requireReady();
  const result = await rulesFor(person.id).retire(text(formData, "id"));
  done(result.ok ? "Stopped. Agents will no longer see it." : result.message);
}

/** Saves the person's edit as a new version and approves it in one step (FR-E2). Category, scope and reason stay as they were. */
export async function editRule(formData: FormData) {
  const person = await requireReady();
  const svc = rulesFor(person.id);
  const old = await svc.get(text(formData, "id"));
  if (!old) return done("We could not find that rule.");
  const result = await svc.editAndApprove(old.id, {
    text: text(formData, "text"),
    when: text(formData, "when"),
    do: text(formData, "do"),
    dont: text(formData, "dont"),
    strength: text(formData, "strength"),
    category: old.category,
    scope: old.scope,
    because: old.because,
    sourceFeedbackId: old.sourceFeedbackId,
  });
  if (!result.ok) done(result.message);
  else done("Saved as a new version and approved.", result.rule.id);
}

/**
 * The person's choice on a proposed rule that overlaps one they already have (spec 6.3, FR-E3): replace it, keep both,
 * or merge. The merged wording is the person's own; category, scope and reason carry over from the proposal.
 */
export async function resolveRule(formData: FormData) {
  const person = await requireReady();
  const svc = rulesFor(person.id);
  const kind = text(formData, "kind");
  if (kind !== "replace" && kind !== "keep_both" && kind !== "merge") return done("We could not tell which choice you made.");
  const proposal = await svc.get(text(formData, "id"));
  if (!proposal) return done("We could not find that rule.");
  const draft =
    kind === "merge"
      ? {
          text: text(formData, "text"),
          when: text(formData, "when"),
          do: proposal.do ?? "",
          dont: proposal.dont ?? "",
          strength: proposal.strength,
          category: proposal.category,
          scope: proposal.scope,
          because: proposal.because,
          sourceFeedbackId: proposal.sourceFeedbackId,
        }
      : undefined;
  const result = await svc.resolveConflict(proposal.id, { kind, targetId: text(formData, "targetId"), draft });
  if (!result.ok) return done(result.message);
  done(
    kind === "replace"
      ? "Replaced. The new rule is saved and your earlier one is retired."
      : kind === "keep_both"
        ? "Saved. Both rules are kept, and agents can see that they overlap."
        : "Merged and saved. The merged rule takes the place of your earlier one.",
    result.rule.id,
  );
}

/** Deletes a rule for good (spec FR-H3), at any stage. Agents never see it again; a copy an agent kept in its own memory is outside our control. */
export async function deleteRule(formData: FormData) {
  const person = await requireReady();
  const gone = await dataFor(person.id).deleteRule(text(formData, "id"));
  done(gone ? "Deleted. This does not delete a copy an agent may have kept in its own memory." : "We could not find that rule.");
}
