// One synthetic task's journey on the LIVE database. COUNTS AND LABELS ONLY: it never prints a summary, a rule or a detail.
//   LIVE_CHECK=inspect TASK_ID=<id>   whether the task exists, its automatic checks (verdict, scorer, model), the score and the month's spend
//   LIVE_CHECK=delete  TASK_ID=<id>   exports the owner's data (counts only), then hard-deletes this one task, then re-counts
// Run:  LIVE_CHECK=inspect TASK_ID=... node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/live-check.script.ts --disableConsoleIntercept
import { eq } from "drizzle-orm";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { hardDeleteTask } from "@/db/purge";
import { adherenceChecks, tasks } from "@/db/schema";
import { monthlyModelSpend } from "@/db/system";
import { masterKeysFromEnv } from "@/lib/crypto";

// The live data was encrypted with the live master key (same rule as the summary backfill script).
const live = Boolean(process.env.LIVE_DATABASE_URL) && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL;
const masters = () => masterKeysFromEnv({ ...process.env, MASTER_KEY: live ? process.env.LIVE_MASTER_KEY || process.env.MASTER_KEY : process.env.MASTER_KEY });
import { exportAll } from "@/lib/data-export";
import { scoreSummary } from "@/lib/scoring/run";

it("inspects or deletes one synthetic task", async () => {
  const action = process.env.LIVE_CHECK;
  const taskId = process.env.TASK_ID ?? "";
  if (!["inspect", "delete"].includes(action ?? "") || !/^[0-9a-f-]{36}$/.test(taskId)) throw new Error("Set LIVE_CHECK=inspect|delete and TASK_ID.");
  const db = getDb();
  console.log(`Database: ${live ? "LIVE" : "TEST"}.`);
  const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
  if (!task) {
    console.log("Task: not found (already gone).");
    return;
  }
  const userId = task.userId;
  const count = async () => {
    const checks = await db.select().from(adherenceChecks).where(eq(adherenceChecks.taskId, taskId));
    return checks;
  };
  const checks = await count();
  console.log(`Task exists. outcome=${task.outcome} category=${task.category} summaryEncrypted=${Boolean(task.summaryEncrypted)} readableSummaryEmpty=${!task.summary}`);
  console.log(`Automatic checks: ${checks.length}`);
  for (const c of checks) console.log(`  verdict=${c.verdict} scorer=${c.scorer} model=${c.modelVersion} pApplies=${c.pApplies} pViolated=${c.pViolated}`);
  const month = new Date().toISOString().slice(0, 7);
  console.log(`Month model spend so far: $${(await monthlyModelSpend(db, month)).toFixed(4)}`);
  const doc = await exportAll(db, masters(), userId);
  const json = JSON.stringify(doc);
  console.log(`Export contains the task id: ${json.includes(taskId)}; export size ${json.length} characters; ciphertext markers in export: ${/"(summaryEncrypted|detailsEncrypted|valueEncrypted)"/.test(json)}`);
  if (action === "delete") {
    console.log(`Hard delete: ${await hardDeleteTask(db, userId, taskId)}`);
    const [after] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1);
    console.log(`After delete: task rows=${after ? 1 : 0}, checks=${(await count()).length}`);
    console.log(`Export now contains the task id: ${JSON.stringify(await exportAll(db, masters(), userId)).includes(taskId)}`);
  }
  void scoreSummary;
});
