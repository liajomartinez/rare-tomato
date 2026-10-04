// Encrypts existing task summaries, checks the result, or puts them back (rollback). COUNTS ONLY: it never prints a summary.
// Pick the action with SUMMARY_BACKFILL=dry | run | check | restore. Run it on the TEST database through the launcher:
//   SUMMARY_BACKFILL=check node scripts/with-test-db.mjs node node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/backfill-summaries.script.ts --disableConsoleIntercept
// On the LIVE database it refuses unless CONFIRM_LIVE=yes AND NEON_COPY_CONFIRMED=yes (a fresh safety copy exists), and only
// when Lia has said go (the project notes).
import { it } from "vitest";
import { getDb } from "@/db/client";
import { backfillSummaries, checkSummaryEncryption, restorePlainSummaries } from "@/db/summary-backfill";
import { masterKeysFromEnv } from "@/lib/crypto";

it("runs the summary encryption action", async () => {
  const live = Boolean(process.env.LIVE_DATABASE_URL) && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL;
  const action = process.env.SUMMARY_BACKFILL;
  if (!["dry", "run", "check", "restore"].includes(action ?? "")) throw new Error("Set SUMMARY_BACKFILL to dry, run, check or restore.");
  if (live && action !== "check" && action !== "dry") {
    if (process.env.CONFIRM_LIVE !== "yes" || process.env.NEON_COPY_CONFIRMED !== "yes") {
      throw new Error("This is the live database. It needs CONFIRM_LIVE=yes and NEON_COPY_CONFIRMED=yes, and only after Lia has said go.");
    }
  }
  // The live data was encrypted with the live master key; the test data with the test one.
  const masters = masterKeysFromEnv({ ...process.env, MASTER_KEY: live ? process.env.LIVE_MASTER_KEY || process.env.MASTER_KEY : process.env.MASTER_KEY });
  const db = getDb();
  console.log(`Database: ${live ? "LIVE" : "TEST"}. Action: ${action}. (Counts only; no summary text is printed.)`);
  if (action === "check") console.log(JSON.stringify(await checkSummaryEncryption(db, masters)));
  else if (action === "restore") console.log(JSON.stringify(await restorePlainSummaries(db, masters)));
  else console.log(JSON.stringify(await backfillSummaries(db, masters, { dryRun: action === "dry" })));
});
