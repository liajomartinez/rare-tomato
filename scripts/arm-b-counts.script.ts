// Arm B counter (read-only). Reads OUR OWN audit log and prints COUNTS, agent names, fact categories and times.
// It prints no emails, no ids, no task text, no rule text and no fact values. It only runs SELECT statements.
// Reuses the Arm A approach (scripts/experiment-counts.script.ts) with three changes: every connection whose name starts with
// the agent's name is included (Muse registers a new identity each time it reconnects), every call in the overall window is
// listed so calls outside the prompt windows are visible, and the categories asked for are shown.
//
//   EXPERIMENT_WINDOWS=<path to windows.json> npm run experiment:armb
//   (optional) EXPERIMENT_EMAIL=<start of the account email>
// windows.json is a list of { "agent": "Claude", "prompt": 1, "from": "<ISO UTC>", "to": "<ISO UTC>" }.
import fs from "node:fs";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { agentConnections, auditLog, users } from "@/db/schema";
import { and, gte, like, lte } from "drizzle-orm";

interface Window { agent: string; prompt: number; from: string; to: string }
const TRACKED = ["get_rules", "get_care_profile", "log_task"] as const;
const SLACK_MS = 60 * 60 * 1000; // look one hour either side of the windows for calls outside them

const when = (s: string) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a valid time: ${s}`);
  return d;
};

it("prints Arm B counts from our own log", async () => {
  const path = process.env.EXPERIMENT_WINDOWS;
  if (!path) throw new Error("Set EXPERIMENT_WINDOWS to the path of windows.json.");
  const windows = JSON.parse(fs.readFileSync(path, "utf8")) as Window[];
  if (!windows.length) throw new Error("windows.json is empty.");
  const starts = windows.map((w) => when(w.from).getTime());
  const ends = windows.map((w) => when(w.to).getTime());
  const lo = new Date(Math.min(...starts) - SLACK_MS);
  const hi = new Date(Math.max(...ends) + SLACK_MS);

  const db = getDb();
  const around = await db.select().from(auditLog).where(and(gte(auditLog.at, lo), lte(auditLog.at, hi)));

  // Which account? The one named by EXPERIMENT_EMAIL, otherwise the single account that has calls around the windows.
  let userId: string;
  if (process.env.EXPERIMENT_EMAIL) {
    const found = await db.select().from(users).where(like(users.email, `${process.env.EXPERIMENT_EMAIL}%`));
    if (found.length !== 1) throw new Error(`Expected exactly one account matching the email start, found ${found.length}.`);
    userId = found[0].id;
  } else {
    const ids = [...new Set(around.map((r) => r.userId))];
    if (ids.length !== 1) throw new Error(`Without EXPERIMENT_EMAIL I need exactly one account with calls around the windows, found ${ids.length}.`);
    userId = ids[0];
  }
  const rows = around.filter((r) => r.userId === userId).sort((a, b) => a.at.getTime() - b.at.getTime());
  const conns = (await db.select().from(agentConnections)).filter((c) => c.userId === userId); // including removed ones
  const byId = new Map(conns.map((c) => [c.id, c]));
  const connectionsFor = (agent: string) => conns.filter((c) => c.name.toLowerCase().startsWith(agent.toLowerCase()));
  const label = (id: string | null) => (id && byId.get(id) ? `${byId.get(id)!.name} (${byId.get(id)!.type ?? "unassigned"})` : "-");

  console.log(`Audit log, ${lo.toISOString()} to ${hi.toISOString()} (windows plus one hour either side). Counts only; agent-side activity we cannot see is not included.\n`);
  console.log("agent | prompt | window (UTC) | get_rules | get_care_profile | log_task | refused | categories asked for | connections matched");
  const inAnyWindow = new Set<string>();
  for (const w of windows) {
    const from = when(w.from);
    const to = when(w.to);
    const ids = new Set(connectionsFor(w.agent).map((c) => c.id));
    const mine = rows.filter((r) => r.agentConnectionId && ids.has(r.agentConnectionId) && r.at >= from && r.at <= to);
    for (const r of rows) if (r.at >= from && r.at <= to) inAnyWindow.add(r.id);
    const n = (action: string) => mine.filter((r) => r.action === action).length;
    const refused = mine.filter((r) => r.action.startsWith("refused:")).length;
    const cats = [...new Set(mine.filter((r) => r.action === "get_care_profile").flatMap((r) => r.categoriesRead ?? []))].sort().join(",") || "-";
    console.log(`${w.agent} | ${w.prompt} | ${w.from} to ${w.to} | ${n(TRACKED[0])} | ${n(TRACKED[1])} | ${n(TRACKED[2])} | ${refused} | ${cats} | ${ids.size || "NONE FOUND"}`);
  }

  console.log("\nEvery call around the windows, in time order (so calls outside the windows, or by other connections, are visible):");
  console.log("time (UTC) | agent connection | action | categories | in a window?");
  for (const r of rows) {
    console.log(`${r.at.toISOString()} | ${label(r.agentConnectionId)} | ${r.actor === "user" ? "(person) " : ""}${r.action.split(":").length > 1 && r.action.startsWith("rule_") ? r.action.split(":")[0] : r.action} | ${(r.categoriesRead ?? []).join(",") || "-"} | ${inAnyWindow.has(r.id) ? "yes" : "NO"}`);
  }
  console.log(`\nTotal calls around the windows: ${rows.length}. Outside every window: ${rows.filter((r) => !inAnyWindow.has(r.id)).length}.`);
});
