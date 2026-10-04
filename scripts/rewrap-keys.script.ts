// Master key change drill and job (ADR 0016). COUNTS ONLY: it never prints a key or a value.
//   REWRAP=dry | run | check
// The NEW key is MASTER_KEY and the OLD key is MASTER_KEY_PREVIOUS, both from the environment (set in .env for a drill on the test database).
//   REWRAP=dry   how many data keys would be re-wrapped
//   REWRAP=run   re-wrap them (safe to repeat)
//   REWRAP=check do all data keys open with the new key alone? (only then may the old key be destroyed)
// On the LIVE database a run needs CONFIRM_LIVE=yes AND NEON_COPY_CONFIRMED=yes (a fresh safety copy exists).
import { it } from "vitest";
import { getDb } from "@/db/client";
import { everyKeyOpensWithCurrentOnly, rewrapAllDataKeys } from "@/db/rewrap";
import { masterKeysFromEnv } from "@/lib/crypto";

it("runs the key change action", async () => {
  const action = process.env.REWRAP;
  if (!["dry", "run", "check"].includes(action ?? "")) throw new Error("Set REWRAP to dry, run or check.");
  const live = Boolean(process.env.LIVE_DATABASE_URL) && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL;
  if (live && action === "run" && (process.env.CONFIRM_LIVE !== "yes" || process.env.NEON_COPY_CONFIRMED !== "yes")) {
    throw new Error("This is the live database. A run needs CONFIRM_LIVE=yes and NEON_COPY_CONFIRMED=yes (a fresh Neon copy).");
  }
  const masters = masterKeysFromEnv();
  const db = getDb();
  console.log(`Database: ${live ? "LIVE" : "TEST"}. Action: ${action}. Old key present: ${Boolean(masters.previous)}. (Counts only.)`);
  if (action === "check") console.log(JSON.stringify(await everyKeyOpensWithCurrentOnly(db, masters.current)));
  else console.log(JSON.stringify(await rewrapAllDataKeys(db, masters, { dryRun: action === "dry" })));
});
