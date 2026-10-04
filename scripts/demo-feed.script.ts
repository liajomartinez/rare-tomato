// Prints the fictional demo person's feed (what the demo agent recorded), from the database in DATABASE_URL.
// Point it at the Neon TEST branch. Run with:  npm run demo:feed
import { it } from "vitest";
import { getDb } from "@/db/client";
import { masterKeysFromEnv } from "@/lib/crypto";
import { findOrCreateUser } from "@/lib/identity";
import { tasksService } from "@/lib/tasks";

it("shows what the demo agent recorded", async () => {
  if (process.env.LIVE_DATABASE_URL && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL) {
    throw new Error("Refusing to run against the live database");
  }
  const db = getDb();
  const user = await findOrCreateUser(db, { authSubject: "demo_dana_okafor" });
  const feed = await tasksService(db, masterKeysFromEnv(), user.id).feed({ withDetails: true });
  console.log(`Feed has ${feed.length} task(s):`);
  for (const task of feed) {
    console.log(`- ${task.occurredAt.toISOString().slice(0, 16)} | ${task.agentName} did this | ${task.category} | ${task.outcome ?? "no outcome"} | agent-reported | ${task.summary}`);
  }
});
