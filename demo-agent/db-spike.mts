// Database spike: tenant-scoped queries, an encrypted field, and a real row delete on Neon.
// Run with: npm run spike:db   (reads DATABASE_URL from .env)
// Uses only fictional data. Creates one temporary table and drops it at the end.
import { neon } from "@neondatabase/serverless";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL in .env first.");
const sql = neon(url);
const q = (text: string, params: unknown[] = []) => sql.query(text, params) as Promise<Record<string, unknown>[]>;

// AES-256-GCM with Node's built-in crypto (the spike key is random; the real design wraps a per-user key).
const key = randomBytes(32);
function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}
function decrypt(packed: string): string {
  const [iv, tag, body] = packed.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

// Every read goes through this helper, which always filters by user_id (tenant scoping).
const factsFor = (userId: string) =>
  q("SELECT id, category, value_encrypted FROM spike_facts WHERE user_id = $1 ORDER BY id", [userId]);

const results: [string, boolean][] = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
};

const [{ version }] = (await q("SELECT version() AS version")) as { version: string }[];
console.log("Server:", version.slice(0, 40));

await q("DROP TABLE IF EXISTS spike_facts");
await q(`CREATE TABLE spike_facts (
  id serial PRIMARY KEY, user_id text NOT NULL, category text NOT NULL,
  value_encrypted text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`);

try {
  const seed: [string, string, string][] = [
    ["user_a", "family", "Mia has soccer on Tuesdays after school"],
    ["user_a", "preferences", "Prefers text over calls"],
    ["user_b", "family", "Theo needs 15 minutes of notice before leaving"],
  ];
  for (const [u, c, v] of seed) {
    await q("INSERT INTO spike_facts (user_id, category, value_encrypted) VALUES ($1, $2, $3)", [u, c, encrypt(v)]);
  }

  const a = await factsFor("user_a");
  const b = await factsFor("user_b");
  check("user A sees exactly their 2 facts", a.length === 2);
  check("user B sees exactly their 1 fact", b.length === 1);
  const bId = b[0].id;
  const crossRead = await q("SELECT id FROM spike_facts WHERE user_id = $1 AND id = $2", ["user_a", bId]);
  check("user A cannot read user B's row by id", crossRead.length === 0);

  const raw = await q("SELECT value_encrypted FROM spike_facts");
  check("stored values contain no readable plaintext", raw.every((r) => !String(r.value_encrypted).includes("soccer") && !String(r.value_encrypted).includes("Theo")));
  check("encrypted value decrypts back to the original", decrypt(String(a[0].value_encrypted)) === seed[0][2]);

  const timings: number[] = [];
  for (let i = 0; i < 20; i++) {
    const t = performance.now();
    await factsFor("user_a");
    timings.push(performance.now() - t);
  }
  timings.sort((x, y) => x - y);
  console.log(`Read latency over 20 queries: median ${timings[10].toFixed(0)} ms, slowest ${timings[19].toFixed(0)} ms (includes the network from this computer)`);

  await q("DELETE FROM spike_facts WHERE user_id = $1", ["user_a"]);
  check("after delete, user A has 0 rows", (await factsFor("user_a")).length === 0);
  check("after delete, user B's row is untouched", (await factsFor("user_b")).length === 1);
} finally {
  await q("DROP TABLE IF EXISTS spike_facts");
  console.log("Temporary table dropped.");
}
const failed = results.filter(([, ok]) => !ok).length;
console.log(failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`);
process.exit(failed === 0 ? 0 : 1);
