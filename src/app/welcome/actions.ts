"use server";

import { redirect } from "next/navigation";
import { acceptTermsFor } from "@/db/production";
import { currentSession } from "@/lib/session";

// The person's id always comes from their sign-in. The Terms version recorded is the one this server is running, never one sent by the form.
export async function confirmAdult(formData: FormData) {
  const session = await currentSession();
  if (session.status !== "needs_attestation") redirect("/");
  // One unchecked box, and it must be ticked by the person: "I am 18 or older and agree to the Terms".
  if (formData.get("accept") !== "on") redirect("/welcome?missing=1");
  await acceptTermsFor(session.person.id);
  redirect("/");
}
