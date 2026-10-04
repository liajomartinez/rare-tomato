// Experiment counter (M3b). Reads OUR OWN audit log for one account and prints COUNTS. It prints only counts and agent
// names: no personal details, no task text, no rule text. It is read-only.
//
// Two ways to run it (both through `npm run experiment:counts`; the database is whichever DATABASE_URL points at):
//   1. One window, all agents:
//        EXPERIMENT_EMAIL=<start of the account email> EXPERIMENT_FROM=<ISO UTC> EXPERIMENT_TO=<ISO UTC> npm run experiment:counts
//   2. One row per agent and prompt, from a results file (JSON list of {agent, prompt, from, to}):
//        EXPERIMENT_EMAIL=<start of the account email> EXPERIMENT_WINDOWS=<path to the JSON file> npm run experiment:counts
import fs from "node:fs";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { agentConnections, auditLog, users } from "@/db/schema";
import { and, eq, isNull, like } from "drizzle-orm";

const ACTIONS = ["get_rules", "get_care_profile", "log_task", "refused:get_rules", "refused:get_care_profile", "refused:log_task"] as const;

interface Window {
  agent: string;
  prompt: number;
  from: string;
  to: string;
}

it("prints counts from our own log", async () => {
  const email = process.env.EXPERIMENT_EMAIL;
  if (!email) throw new Error("Set EXPERIMENT_EMAIL (the start of the account email).");
  const db = getDb();
  const matches = await db.select().from(users).where(like(users.email, `${email}%`));
  if (matches.length !== 1) throw new Error(`Expected exactly one account matching "${email}", found ${matches.length}.`);
  const userId = matches[0].id;

  const connections = await db.select().from(agentConnections).where(and(eq(agentConnections.userId, userId), isNull(agentConnections.deletedAt)));
  const rows = await db.select().from(auditLog).where(eq(auditLog.userId, userId));
  const countsFor = (connectionId: string, from: Date, to: Date) => {
    const mine = rows.filter((r) => r.agentConnectionId === connectionId && r.at >= from && r.at <= to);
    return ACTIONS.map((a) => `${a}=${mine.filter((r) => r.action === a).length}`).join(" ");
  };
  const valid = (s: string) => {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) throw new Error(`Not a valid time: ${s}`);
    return d;
  };

  if (process.env.EXPERIMENT_WINDOWS) {
    const windows = JSON.parse(fs.readFileSync(process.env.EXPERIMENT_WINDOWS, "utf8")) as Window[];
    console.log("agent | prompt | window (UTC) | counts from our own audit log (agent-side activity we cannot see is not included)");
    for (const w of windows) {
      const conn = connections.find((c) => c.name.toLowerCase().startsWith(w.agent.toLowerCase()));
      if (!conn) {
        console.log(`${w.agent} | ${w.prompt} | ${w.from} to ${w.to} | NO MATCHING AGENT CONNECTION`);
        continue;
      }
      console.log(`${w.agent} | ${w.prompt} | ${w.from} to ${w.to} | ${countsFor(conn.id, valid(w.from), valid(w.to))}`);
    }
    return;
  }

  const from = valid(process.env.EXPERIMENT_FROM ?? "");
  const to = valid(process.env.EXPERIMENT_TO ?? "");
  console.log(`Window: ${from.toISOString()} to ${to.toISOString()} (counts from our own audit log; agent-side activity we cannot see is not included)`);
  for (const c of connections) console.log(`${String(c.name).padEnd(14)} ${countsFor(c.id, from, to)}`);
});
