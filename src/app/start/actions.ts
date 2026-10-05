"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { rulesFor } from "@/db/production";
import { FLOW_COOKIE_DAYS, flowAgent, LATER_COOKIE, PICKED_COOKIE, parsePicked } from "@/lib/onboarding-flow";
import { requireReady } from "@/lib/session";
import { TERMS_VERSION } from "@/lib/strings";
import { TERMS_COOKIE, TERMS_COOKIE_SECONDS } from "@/lib/terms-cookie";

// Only two small cookies are written here (which agents were picked, and "Do this later"). The person's id never comes from the form.

const maxAge = FLOW_COOKIE_DAYS * 24 * 60 * 60;

/**
 * "Continue" on Create your account. The box must be ticked (the button is off until it is, and this checks again on the server). The tick is kept in one
 * short-lived cookie so the sign-in return can record it, with the time, on the new account (see src/lib/terms-cookie.ts). Then the hosted sign-in page.
 */
export async function agreeAndSignIn(formData: FormData) {
  if (formData.get("accept") !== "on") redirect("/start/account");
  const jar = await cookies();
  jar.set(TERMS_COOKIE, TERMS_VERSION, { maxAge: TERMS_COOKIE_SECONDS, path: "/", httpOnly: true, sameSite: "lax", secure: true });
  redirect("/sign-in");
}

/**
 * "Continue" on Which agent do you want to connect first. One agent is required and goes straight to its setup. Agents picked earlier stay remembered
 * (so Home can list them as "Not connected yet"); nothing else about onboarding is stored on the server.
 */
export async function savePicks(formData: FormData) {
  await requireReady();
  const picked = parsePicked(formData.getAll("agent").map(String).slice(0, 1).join(","));
  if (picked.length === 0) redirect("/start/agents");
  const jar = await cookies();
  const before = parsePicked(jar.get(PICKED_COOKIE)?.value).map((a) => a.key);
  const all = [...new Set([...before, picked[0].key])];
  jar.set(PICKED_COOKIE, all.join(","), { maxAge, path: "/", httpOnly: true, sameSite: "lax", secure: true });
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

/**
 * "Save rule" on Write your first rule. The person's own words become one rule, approved by them in the same tap (so it is active at once), for every
 * agent. The rule service still checks the text (length, blocked data). If it refuses, the person comes back to the same screen with the reason.
 */
export async function saveFirstRule(formData: FormData) {
  const person = await requireReady();
  const key = String(formData.get("agent") ?? "");
  const agent = flowAgent(key);
  const back = (error?: string) => `/start/setup?agent=${agent?.key ?? "claude"}&step=rule${error ? `&error=${encodeURIComponent(error)}` : ""}`;
  const text = String(formData.get("text") ?? "").trim();
  if (!text) redirect(back("Type a rule first."));
  const svc = rulesFor(person.id);
  const made = await svc.propose({ text, category: "other", scope: "all", when: "Any task", because: "Your own words from setup." });
  if (!made.ok) redirect(back(made.message));
  const approved = await svc.approve(made.rule.id);
  if (!approved.ok) redirect(back(approved.message));
  redirect(`/start/setup?agent=${agent?.key ?? "claude"}&step=done`);
}
