// Host request-log counter (read-only). For each window in a windows.json file, counts the requests the host received,
// grouped by status, method and path. It prints COUNTS ONLY: no content, no addresses, no headers. The host's logs carry no
// agent name, so requests are attributed to a window by time only.
//   node scripts/host-log-counts.mjs <path to windows.json>
// Uses `vercel logs` (a read-only call to the host's API, not traffic to the live site) from the linked project.
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/host-log-counts.mjs <path to windows.json>");
  process.exit(1);
}
const windows = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(windows) || windows.length === 0) throw new Error("windows.json is empty.");

const when = (s) => {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Not a valid time: ${s}`);
  return d;
};

// One fetch for the whole span, then split by window here. The host caps one fetch, so a warning is printed if it is hit.
// IMPORTANT: the host keeps request logs only briefly. On 2026-10-01 a window about three hours old was refused with an
// error, while a recent one worked. Run this right after the runs finish, and save the output with the results.
// For testing, a saved file of log lines can be given as a second argument instead of calling the host.
const LIMIT = 1000;
const from = new Date(Math.min(...windows.map((w) => when(w.from).getTime())) - 60_000);
const to = new Date(Math.max(...windows.map((w) => when(w.to).getTime())) + 60_000);
let stdout;
if (process.argv[3]) {
  stdout = fs.readFileSync(process.argv[3], "utf8");
} else {
  const run = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["vercel", "logs", "--json", "--since", from.toISOString(), "--until", to.toISOString(), "--limit", String(LIMIT)],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  const text = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status !== 0 || /Response Error/.test(text)) {
    const reason = (text.match(/Response Error \(\d+\)/) ?? ["no detail"])[0];
    console.error(
      `Could not read the host's logs (${reason}). Most likely the windows are too old: the host keeps request logs only for a short time ` +
        `(a window about three hours old was refused). If the run was recent, check that the project is linked and the host CLI is signed in. ` +
        `If the logs have aged out, say so in the results and rely on the audit log alone.`,
    );
    process.exit(1);
  }
  stdout = run.stdout;
}
const records = stdout.split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
if (records.length >= LIMIT) console.warn(`WARNING: the fetch hit its limit of ${LIMIT}; narrow the windows. Counts below may be incomplete.`);

console.log(`Host requests from ${from.toISOString()} to ${to.toISOString()}: ${records.length} in total. Attribution is by time window only (no agent names in these logs).\n`);
console.log("agent | prompt | window (UTC) | requests | reached our host? | by status, method and path");
for (const w of windows) {
  const a = when(w.from).getTime();
  const b = when(w.to).getTime();
  const mine = records.filter((r) => r.timestamp >= a && r.timestamp <= b && r.requestPath);
  const groups = {};
  for (const r of mine) {
    const k = `${r.responseStatusCode} ${r.requestMethod} ${r.requestPath}`;
    groups[k] = (groups[k] ?? 0) + 1;
  }
  const posts = mine.filter((r) => r.requestMethod === "POST" && String(r.requestPath).startsWith("/mcp")).length;
  const verdict = mine.length === 0 ? "no request at all" : posts > 3 ? "yes, probably a tool call (more than a handshake)" : "yes, a handshake or very little";
  console.log(`${w.agent} | ${w.prompt} | ${w.from} to ${w.to} | ${mine.length} | ${verdict} | ${JSON.stringify(groups)}`);
}
console.log("\nA handshake is a few POSTs to /mcp. This table cannot say which tool was called; the audit log does that.");
