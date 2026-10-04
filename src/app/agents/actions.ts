"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { requireReady } from "@/lib/session";

// The person's id always comes from their sign-in (requireReady), never from the form.

const text = (f: FormData, key: string) => String(f.get(key) ?? "");
const done = (message?: string): never => {
  revalidatePath("/agents");
  redirect(message ? `/agents?message=${encodeURIComponent(message)}` : "/agents");
};

export async function confirmAgent(formData: FormData) {
  const person = await requireReady();
  const result = await agentsFor(person.id).confirm(text(formData, "id"), {
    type: text(formData, "type"),
    name: text(formData, "name"),
    extraScopes: formData.getAll("extra").map(String),
    replaceId: text(formData, "replaceId"),
  });
  done(result.ok ? "Agent confirmed." : result.message);
}

export async function renameAgent(formData: FormData) {
  const person = await requireReady();
  const result = await agentsFor(person.id).rename(text(formData, "id"), text(formData, "name"));
  done(result.ok ? "Name saved." : result.message);
}

export async function changeAccess(formData: FormData) {
  const person = await requireReady();
  const result = await agentsFor(person.id).changeAccess(text(formData, "id"), formData.getAll("scope").map(String));
  done(result.ok ? "Access saved. It applies from the agent's next request." : result.message);
}

export async function revokeAgent(formData: FormData) {
  const person = await requireReady();
  const result = await agentsFor(person.id).revoke(text(formData, "id"));
  done(result.ok ? "Agent disconnected. It stops working from its next request." : result.message);
}

export async function removeAgent(formData: FormData) {
  const person = await requireReady();
  const result = await agentsFor(person.id).remove(text(formData, "id"));
  done(result.ok ? "Agent removed." : result.message);
}
