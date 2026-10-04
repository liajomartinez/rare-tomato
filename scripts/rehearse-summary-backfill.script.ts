// REHEARSAL on a COPY. Reads the database in DATABASE_URL (the Neon TEST branch, through the launcher; it refuses live) with SELECTs
// only, copies its users, agent connections and tasks into a throwaway IN-MEMORY database at the previous schema, then runs the new
// migration and the summary backfill on the copy. Nothing is written to the source database. Prints COUNTS ONLY.
//   node scripts/with-test-db.mjs node node_modules/vitest/vitest.mjs run --config vitest.scripts.config.mts scripts/rehearse-summary-backfill.script.ts --disableConsoleIntercept
import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { it } from "vitest";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { backfillSummaries, checkSummaryEncryption } from "@/db/summary-backfill";
import type { Db } from "@/db/client";
import { masterKeysFromEnv } from "@/lib/crypto";

it("rehearses the summary backfill on a copy of the test branch", async () => {
  if (process.env.LIVE_DATABASE_URL) throw new Error("Run through scripts/with-test-db.mjs (test database only).");
  const source = getDb();
  const FULL = path.resolve(process.cwd(), "drizzle");

  // 1. A throwaway database at the PREVIOUS schema (everything except the newest migration).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rehearsal-"));
  fs.mkdirSync(path.join(dir, "meta"));
  const journal = JSON.parse(fs.readFileSync(path.join(FULL, "meta", "_journal.json"), "utf8"));
  const last = journal.entries[journal.entries.length - 1];
  journal.entries = journal.entries.filter((e: { idx: number }) => e.idx < last.idx);
  fs.writeFileSync(path.join(dir, "meta", "_journal.json"), JSON.stringify(journal));
  for (const e of journal.entries) fs.copyFileSync(path.join(FULL, `${e.tag}.sql`), path.join(dir, `${e.tag}.sql`));
  const pg = new PGlite();
  const copy = drizzle(pg, { schema });
  await migrate(copy, { migrationsFolder: dir });

  // 2. Copy rows (read-only on the source). Tasks go in by SQL because the new column does not exist yet in the copy.
  const users = await source.select().from(schema.users);
  const conns = await source.select().from(schema.agentConnections);
  // The source has the OLD tasks columns only (it has not been migrated), so ask for exactly those.
  const res = await (source as any).execute( // eslint-disable-line @typescript-eslint/no-explicit-any
    sql`select id, user_id, agent_connection_id, external_id, summary, category, details_encrypted, outcome, rules_consulted, occurred_at, created_at, updated_at, deleted_at from tasks`,
  );
  const tasks = ((res.rows ?? res) as Record<string, unknown>[]).map((r) => ({
    id: r.id, userId: r.user_id, agentConnectionId: r.agent_connection_id, externalId: r.external_id, summary: r.summary, category: r.category,
    detailsEncrypted: r.details_encrypted, outcome: r.outcome, rulesConsulted: r.rules_consulted, occurredAt: new Date(String(r.occurred_at)),
    createdAt: new Date(String(r.created_at)), updatedAt: new Date(String(r.updated_at)), deletedAt: r.deleted_at ? new Date(String(r.deleted_at)) : null,
  }));
  for (let i = 0; i < users.length; i += 100) await copy.insert(schema.users).values(users.slice(i, i + 100));
  for (let i = 0; i < conns.length; i += 100) await copy.insert(schema.agentConnections).values(conns.slice(i, i + 100));
  let copied = 0;
  for (const t of tasks) {
    await pg.query(
      `insert into tasks (id, user_id, agent_connection_id, external_id, summary, category, details_encrypted, outcome, rules_consulted, occurred_at, created_at, updated_at, deleted_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [t.id, t.userId, t.agentConnectionId, t.externalId, t.summary, t.category, t.detailsEncrypted, t.outcome, t.rulesConsulted, t.occurredAt, t.createdAt, t.updatedAt, t.deletedAt],
    );
    copied++;
  }
  console.log(`Copied from the test branch: ${users.length} users, ${conns.length} connections, ${copied} tasks. (Source untouched.)`);

  // 3. Upgrade the copy and run the backfill on it.
  await migrate(copy, { migrationsFolder: FULL });
  const db = copy as unknown as Db;
  const masters = masterKeysFromEnv({ ...process.env, MASTER_KEY: process.env.MASTER_KEY });
  console.log("Dry run:      ", JSON.stringify(await backfillSummaries(db, masters, { dryRun: true })));
  console.log("Backfill:     ", JSON.stringify(await backfillSummaries(db, masters)));
  console.log("Second run:   ", JSON.stringify(await backfillSummaries(db, masters)));
  console.log("Check:        ", JSON.stringify(await checkSummaryEncryption(db, masters)));
  // Who owns the rows that could not be encrypted? Counted by kind of account only (never names, emails or ids).
  const left = await pg.query<{ kind: string; n: number }>(
    `select case when u.auth_subject like 'user_test_%' then 'automated test account' when u.auth_subject like 'user_01%' then 'real sign-in account' when u.auth_subject like 'demo_%' then 'demo account' else 'other (' || split_part(u.auth_subject, '_', 1) || '_...)' end as kind, count(*)::int as n
     from tasks t join users u on u.id = t.user_id where t.summary_encrypted is null and t.summary is not null group by 1 order by 2 desc`,
  );
  console.log("Rows still readable-only, by kind of owner:", JSON.stringify(left.rows));
  console.log("(Failed rows are counted and left alone. If they belong to throwaway accounts made by earlier automated tests, their keys were wrapped with random keys, which is expected.)");
}, 300_000);
