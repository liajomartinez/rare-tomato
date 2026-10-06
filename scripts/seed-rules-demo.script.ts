// Puts FICTIONAL sample data into one account on the Neon TEST branch, so the Your rules screen has something to show:
// one agent connection, one fictional marketplace task, a thumbs-down with a note, and one proposed rule (no Claude call, no cost).
// Run it through the test-database launcher (see the walkthrough):
//   node scripts/with-test-db.mjs npm run seed:rules-demo
// It picks the account to fill like this: SEED_AUTH_SUBJECT if set, otherwise the one real (non-demo) account on the test branch.
import { it } from "vitest";
import { getDb } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { masterKeysFromEnv } from "@/lib/crypto";
import { feedbackService } from "@/lib/feedback";
import { attestAdult, findOrCreateUser } from "@/lib/identity";
import { rulesService } from "@/lib/rules";
import { tasksService } from "@/lib/tasks";
import { users } from "@/db/schema";

it("adds fictional sample data for the rules screen", async () => {
  if (process.env.LIVE_DATABASE_URL && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL) throw new Error("Refusing to run against the live database");
  if (process.env.LIVE_DATABASE_URL) throw new Error("Run this through scripts/with-test-db.mjs so live settings are hidden.");
  const db = getDb();
  const subject = process.env.SEED_AUTH_SUBJECT;
  // A named throwaway account is created if it does not exist yet (fictional, test branch only).
  if (subject) await attestAdult(db, (await findOrCreateUser(db, { authSubject: subject, email: `${subject}@example.test` })).id);
  const all = await db.select().from(users);
  const candidates = subject ? all.filter((u) => u.authSubject === subject) : all.filter((u) => !u.authSubject.startsWith("demo_") && !u.authSubject.startsWith("user_test_") && !u.authSubject.startsWith("seed_"));
  if (candidates.length !== 1) throw new Error(`Expected exactly one account to fill, found ${candidates.length}. Sign in once on the test site first.`);
  const userId = candidates[0].id;
  const t = tenantDb(db, userId);
  const masters = masterKeysFromEnv();

  const conn = await t.agentConnections.insert({ name: "Marge (sample)", type: "other", scopes: ["rules:read", "tasks:write"], linkConfirmedAt: new Date() });
  const logged = await tasksService(db, masters, userId).logTask(conn.id as string, {
    externalId: `sample-${Date.now()}`,
    summary: "Sample (fictional): told a buyer the 27-inch monitor could go for $65 and be picked up in an hour, and said the owner would be home.",
    category: "messaging",
  });
  if (!logged.ok) throw new Error("Could not add the sample task");
  const fb = await feedbackService(db, masters, userId).submit({
    taskId: logged.taskId,
    rating: "down",
    reasonCodes: ["shouldnt_have_done_this", "overstepped_or_untrue"],
    note: "Sample (fictional) note: It agreed to the price and the pickup time without asking me. I want to decide those myself.",
  });
  if (!fb.ok) throw new Error("Could not add the sample feedback");
  const rule = await rulesService(db, userId).propose({
    text: "Do not agree to a price or a pickup time, and do not say I will be home, without asking me first.",
    category: "messaging",
    when: "a buyer asks about price, pickup time or whether someone will be home",
    do: "Pass the buyer's offer to me and wait for my answer",
    dont: "Accept or counter a price, confirm a time, or say I will be somewhere",
    strength: "always",
    because: "It agreed to the price and the pickup time without asking me. I want to decide those myself.",
    sourceFeedbackId: fb.feedback.id,
  });
  if (!rule.ok) throw new Error("Could not add the sample rule");
  console.log("Added: 1 sample agent, 1 sample task, 1 thumbs-down with a note, and 1 proposed rule waiting for your decision.");
});
