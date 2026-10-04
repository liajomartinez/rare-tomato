"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { FLOW_COOKIE_DAYS, LATER_COOKIE, PICKED_COOKIE, parsePicked } from "@/lib/onboarding-flow";
import { requireReady } from "@/lib/session";

// Only two small cookies are written here (which agents were picked, and "Do this later"). The person's id never comes from the form.

const maxAge = FLOW_COOKIE_DAYS * 24 * 60 * 60;

/** "Continue" on Which agents do you use. At least one is required; the first goes straight to its setup step. */
export async function savePicks(formData: FormData) {
  await requireReady();
  const picked = parsePicked(formData.getAll("agent").map(String).join(","));
  if (picked.length === 0) redirect("/start/agents");
  const jar = await cookies();
  jar.set(PICKED_COOKIE, picked.map((a) => a.key).join(","), { maxAge, path: "/", httpOnly: true, sameSite: "lax", secure: true });
  jar.delete(LATER_COOKIE);
  redirect(`/start/setup?agent=${picked[0].key}`);
}

/** "Do this later": remember where the person got to and open Home. */
export async function doThisLater() {
  await requireReady();
  const jar = await cookies();
  jar.set(LATER_COOKIE, "1", { maxAge, path: "/", httpOnly: true, sameSite: "lax", secure: true });
  redirect("/");
}
