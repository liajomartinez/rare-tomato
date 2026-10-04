// The kill switch for Claude calls (spec 6.8). Turns every model call off or on WITHOUT a deploy, by changing a flag in the
// database in DATABASE_URL. Run on the test database through the launcher:
//   MODEL_SWITCH=off node scripts/with-test-db.mjs node node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/model-switch.script.ts --disableConsoleIntercept
// MODEL_SWITCH is off, on, or status. On the LIVE database it only runs with CONFIRM_LIVE=yes, and only when Lia says go.
// When it is off: feedback is still saved, no rule is drafted, no conflict check is made, and the screens say so.
import { it } from "vitest";
import { getDb } from "@/db/client";
import { modelCallsEnabled, setModelCallsEnabled, budgetAlert } from "@/lib/model-gate";

it("changes or shows the Claude kill switch", async () => {
  const live = Boolean(process.env.LIVE_DATABASE_URL) && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL;
  if (live && process.env.CONFIRM_LIVE !== "yes") throw new Error("This is the live database. Set CONFIRM_LIVE=yes only when Lia has said go.");
  const db = getDb();
  const want = process.env.MODEL_SWITCH;
  if (want === "off") await setModelCallsEnabled(db, false);
  else if (want === "on") await setModelCallsEnabled(db, true);
  else if (want !== "status") throw new Error("Set MODEL_SWITCH to off, on or status.");
  const alert = await budgetAlert(db);
  console.log(`Claude calls are ${(await modelCallsEnabled(db)) ? "ON" : "OFF"}. Spend this month so far: about $${alert.spentUsd.toFixed(4)}.`);
});
