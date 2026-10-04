// Sets up the fictional demo person "Dana Okafor" (spec Appendix E), her details, and a fresh token for the
// demo agent. Uses the database in DATABASE_URL, so point it at the Neon TEST branch, never at live data.
// Run with:  npm run demo:setup     The new token is written to .env as DEMO_AGENT_TOKEN and never printed.
import fs from "node:fs";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { masterKeysFromEnv } from "@/lib/crypto";
import { attestAdult, findOrCreateUser } from "@/lib/identity";
import { profileService, type FactInput } from "@/lib/profile";
import { issueDemoToken } from "@/lib/tokens";

const DANA: FactInput[] = [
  { category: "preferences", key: "Contact", value: "Prefers text over calls" },
  { category: "preferences", key: "Confirmations", value: "Wants appointment confirmations by email" },
  { category: "preferences", key: "Appointments", value: "Mornings before 10 am are off limits for appointments" },
  { category: "preferences", key: "Tone", value: "Casual tone in messages to friends, formal to schools" },
  { category: "contacts", key: "Sam", value: "Partner" },
  { category: "contacts", key: "Dentist office", value: "Fictional office, front desk (555) 010-0100" },
  { category: "family", key: "Mia", value: "Has soccer on Tuesdays after school" },
  { category: "family", key: "Theo", value: "Needs 15 minutes of notice before leaving" },
];

it("sets up the demo person, her details, and a new demo token", async () => {
  // Safety: refuse to run against the live database.
  if (process.env.LIVE_DATABASE_URL && process.env.DATABASE_URL === process.env.LIVE_DATABASE_URL) {
    throw new Error("Refusing to run against the live database");
  }
  const db = getDb();
  const user = await findOrCreateUser(db, { authSubject: "demo_dana_okafor", email: "dana@example.test" });
  await attestAdult(db, user.id);
  const svc = profileService(db, masterKeysFromEnv(), user.id);
  if ((await svc.list()).length === 0) {
    for (const fact of DANA) {
      const r = await svc.add(fact, { confirmedWarnings: true });
      if (!r.ok) throw new Error(`Could not add "${fact.key}": ${r.message}`);
    }
  }
  const { token } = await issueDemoToken(tenantDb(db, user.id));
  const lines = fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l && !l.startsWith("DEMO_AGENT_TOKEN="));
  fs.writeFileSync(".env", [...lines, `DEMO_AGENT_TOKEN=${token}`].join("\n") + "\n");
  console.log(`Demo person ready with ${(await svc.list()).length} details. A new DEMO_AGENT_TOKEN was written to .env.`);
});
