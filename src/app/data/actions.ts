"use server";

import { redirect } from "next/navigation";
import { dataFor } from "@/db/production";
import { removeSignInRecord } from "@/lib/sign-in-provider";
import { requireReady } from "@/lib/session";
import { DELETE_PHRASE } from "@/lib/strings";

// The person's id always comes from their sign-in, never from the form.

/** Deletes the account and everything in it, for good (spec FR-H2). Needs the person to type the word. */
export async function deleteMyAccount(formData: FormData) {
  const person = await requireReady();
  if (String(formData.get("confirm") ?? "").trim() !== DELETE_PHRASE) {
    redirect(`/data?message=${encodeURIComponent(`Nothing was deleted. To delete your account, type ${DELETE_PHRASE} in the box.`)}`);
  }
  const data = dataFor(person.id);
  const subject = await data.authSubject(); // read before the account row is gone
  await data.deleteAccount();
  await removeSignInRecord(subject); // best effort; our own data is already deleted
  redirect("/sign-out");
}
