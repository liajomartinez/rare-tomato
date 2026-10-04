"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { agentsFor, profileFor } from "@/db/production";
import { whoCanSee, whoCanSeeFact } from "@/lib/agents-view";
import { CATEGORIES, type Category } from "@/lib/profile";
import { requireReady } from "@/lib/session";

// The person's id always comes from their sign-in, never from the form.

export interface FormState {
  ok?: boolean;
  message?: string;
  /** True when the text mentions something that may be a health or money detail and needs a decision. */
  needsConfirmation?: boolean;
  /** For a health detail that needs a decision: the names of the agents that could read it once saved ("Can be seen by ..."). */
  canSee?: string[];
  /** True when the pending warning is about a health detail (it will be saved with a Sensitive label). */
  health?: boolean;
  values?: { id?: string; category: string; key: string; value: string };
}

const text = (f: FormData, key: string) => String(f.get(key) ?? "");

export async function saveFact(_previous: FormState, formData: FormData): Promise<FormState> {
  const person = await requireReady();
  const id = text(formData, "id");
  const category = text(formData, "category");
  const values = { id: id || undefined, category, key: text(formData, "key"), value: text(formData, "value") };
  if (!(CATEGORIES as readonly string[]).includes(category)) return { message: "Choose preferences, contacts, or family.", values };

  const svc = profileFor(person.id);
  const input = { category: category as Category, key: values.key, value: values.value };
  const opts = { confirmedWarnings: formData.get("confirm") === "on" };
  const result = id ? await svc.update(id, input, opts) : await svc.add(input, opts);

  if (result.ok) {
    revalidatePath("/profile");
    return { ok: true, message: id ? "Saved." : "Added.", values: id ? values : { category, key: "", value: "" } };
  }
  if (result.reason === "needs_confirmation") {
    const agents = await agentsFor(person.id).list();
    const existing = id ? await svc.get(id) : null;
    const health = result.findings.some((f) => f.code === "health_words");
    return {
      message: result.message,
      needsConfirmation: true,
      health,
      // A NEW health detail starts limited to agents the person chooses, with none chosen: nobody can read it until they tick one.
      canSee: existing ? whoCanSeeFact(agents, category as Category, existing.allowedAgentIds) : health ? [] : whoCanSee(agents)[category as Category],
      values,
    };
  }
  return { message: result.message, values };
}

export async function deleteFact(formData: FormData) {
  const person = await requireReady();
  await profileFor(person.id).remove(text(formData, "id"));
  revalidatePath("/profile");
}

export async function reviewFact(formData: FormData) {
  const person = await requireReady();
  await profileFor(person.id).markReviewed(text(formData, "id"));
  revalidatePath("/profile");
}

/** "Only the agents I choose" (open item 19). The ids come from the form but are checked against THIS person's own connected agents. */
export async function setFactVisibility(formData: FormData) {
  const person = await requireReady();
  const mode = text(formData, "mode");
  // Only the two known choices are accepted. A missing or odd value must never quietly widen who can see a detail.
  if (mode !== "all" && mode !== "chosen") redirect(`/profile?message=${encodeURIComponent("Nothing was changed. Choose who can see it and try again.")}`);
  const result = await profileFor(person.id).setVisibility(text(formData, "id"), mode === "chosen" ? formData.getAll("agent").map(String) : null);
  revalidatePath("/profile");
  redirect(`/profile?message=${encodeURIComponent(result.ok ? "Saved who can see it." : result.message)}`);
}
