// Lists audit rows (action names and times only, never content) per connection for a UTC window. Read-only.
//   FROM=2026-10-03T14:30:00Z TO=2026-10-03T19:00:00Z node --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/audit-window.script.ts --disableConsoleIntercept
import { and, asc, gte, lt } from "drizzle-orm";
import { it } from "vitest";
import { getDb } from "@/db/client";
import { agentConnections, auditLog } from "@/db/schema";

it("lists the audit window", async () => {
  const from = new Date(process.env.FROM ?? "");
  const to = new Date(process.env.TO ?? "");
  if (Number.isNaN(+from) || Number.isNaN(+to)) throw new Error("Set FROM and TO (ISO times, UTC).");
  const db = getDb();
  const conns = await db.select().from(agentConnections);
  const name = new Map(conns.map((c) => [c.id, `${c.type ?? "unconfirmed"} "${c.name}" (id ${c.id.slice(0, 8)}, last seen ${c.lastSeenAt ? c.lastSeenAt.toISOString().slice(0, 16) : "never"}${c.revokedAt ? ", revoked" : ""}${c.deletedAt ? ", removed" : ""})`]));
  const rows = await db.select().from(auditLog).where(and(gte(auditLog.at, from), lt(auditLog.at, to))).orderBy(asc(auditLog.at));
  console.log(`Window ${from.toISOString()} to ${to.toISOString()}: ${rows.length} audit rows`);
  for (const r of rows) console.log(`${r.at.toISOString().slice(11, 19)}  ${r.actor}  ${r.action.split(":")[0] === "rule_approved" ? "rule_approved" : r.action}  ${r.agentConnectionId ? name.get(r.agentConnectionId) ?? "unknown connection" : "-"}${r.categoriesRead.length ? "  kinds=" + r.categoriesRead.join(",") : ""}`);
  console.log("Connections:");
  for (const [, v] of name) console.log("  " + v);
});
