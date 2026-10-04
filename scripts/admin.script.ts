// Operator switches and spend summary (spec FR-J1, FR-J2). No deploy needed. COUNTS AND SWITCHES ONLY: it never prints anyone's content.
//   ADMIN=status                 show the switches and this month's spend (safe to run any time)
//   ADMIN=model_off | model_on   all Claude calls
//   ADMIN=jev_off | jev_on       the Jev scorer
//   ADMIN=signups_off | signups_on   new accounts
//   ADMIN=person_model_off | person_model_on  with PERSON=<email>   Claude calls for one person only
// Run on the TEST database:  ADMIN=status node scripts/with-test-db.mjs node node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/admin.script.ts --disableConsoleIntercept
// On the LIVE database a change needs CONFIRM_LIVE=yes (a status check does not).
import { eq } from "drizzle-orm";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { getFlag, JEV_KEY, setFlag, setPersonFlag, SIGNUPS_KEY, spendByPerson } from "@/db/system";
import { ALERT_LEVELS, DEFAULT_MONTHLY_BUDGET_USD, limitsFromEnv, MODEL_SWITCH_KEY, PERSON_MODEL_OFF_FLAG } from "@/lib/model-gate";

const CHANGES = ["model_off", "model_on", "jev_off", "jev_on", "signups_off", "signups_on", "person_model_off", "person_model_on"];

it("runs the operator action", async () => {
  const action = process.env.ADMIN ?? "status";
  if (action !== "status" && !CHANGES.includes(action)) throw new Error(`ADMIN must be status or one of: ${CHANGES.join(", ")}`);
  const live = Boolean(process.env.LIVE_DATABASE_URL) && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL;
  if (live && action !== "status" && process.env.CONFIRM_LIVE !== "yes") throw new Error("This is the live database. A change needs CONFIRM_LIVE=yes.");
  const db = getDb();

  if (action === "model_off" || action === "model_on") await setFlag(db, MODEL_SWITCH_KEY, action === "model_on");
  if (action === "jev_off" || action === "jev_on") await setFlag(db, JEV_KEY, action === "jev_on");
  if (action === "signups_off" || action === "signups_on") await setFlag(db, SIGNUPS_KEY, action === "signups_on");
  if (action.startsWith("person_model_")) {
    const email = process.env.PERSON;
    if (!email) throw new Error("Set PERSON to the person's email.");
    const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!u) throw new Error("No one with that email.");
    await setPersonFlag(db, u.id, PERSON_MODEL_OFF_FLAG, action === "person_model_off");
  }

  const month = new Date().toISOString().slice(0, 7);
  const limits = limitsFromEnv();
  const per = await spendByPerson(db, month);
  const total = per.reduce((a, r) => a + r.usd, 0);
  const on = (v: unknown) => (v === false ? "OFF" : "on");
  console.log(`Database: ${live ? "LIVE" : "TEST"}. Action: ${action}. Month ${month}.`);
  console.log(`Switches: claude calls ${on(await getFlag(db, MODEL_SWITCH_KEY))}; jev ${on(await getFlag(db, JEV_KEY))}; new sign-ups ${on(await getFlag(db, SIGNUPS_KEY))}.`);
  console.log(`Spend: $${total.toFixed(4)} of $${limits.monthlyBudgetUsd} (default ${DEFAULT_MONTHLY_BUDGET_USD}); per-person limit $${limits.personMonthlyLimitUsd}. Alert levels ${ALERT_LEVELS.map((l) => `${l * 100}%`).join(", ")}.`);
  for (const level of ALERT_LEVELS) {
    const seen = await getFlag<number>(db, `budget_alert_level_${month}`);
    if (seen !== undefined && seen >= level) console.log(`  Budget alert level ${level * 100}% has been reached this month.`);
  }
  console.log(`People with activity this month: ${per.length}.`);
  for (const r of per.sort((a, b) => b.usd - a.usd).slice(0, 20)) console.log(`  ${r.userId.slice(0, 8)}  $${r.usd.toFixed(4)}  proposals ${r.proposals}  task logs ${r.taskLogs}`);
});
