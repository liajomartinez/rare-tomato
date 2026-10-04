import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { feedbackService } from "./feedback";
import { errorCode, errorKind, logSafeError, SafeDbError } from "./safe-log";

// A database error must reach logs, error pages and messages as: error kind, a short code, the route name and the time. Never the query text, its
// parameters, a row value or a request body. FAKE is a distinctive label that must appear nowhere.

const FAKE = "SECRET-LABEL-ZEBRA-4417 my-private-detail";
const masters = { current: randomBytes(32) };
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

let output: string[] = [];
const spies: ReturnType<typeof vi.spyOn>[] = [];
beforeEach(() => {
  output = [];
  for (const m of ["log", "error", "warn", "info", "debug"] as const) {
    spies.push(vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void output.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "))));
  }
});
afterEach(() => {
  spies.splice(0).forEach((s) => s.mockRestore());
});
const everything = (e: unknown) => [output.join("\n"), String(e), (e as Error).message, (e as Error).stack ?? "", JSON.stringify(e, Object.getOwnPropertyNames(e as object))].join("\n");

describe("a failing database call", () => {
  it("throws only a short code: the label in the query's parameters appears nowhere", async () => {
    // a detail whose label is FAKE, saved for a person who does not exist: Postgres refuses it (foreign key)
    const failing = db.insert(schema.profileFacts).values({
      userId: crypto.randomUUID(), category: "preferences", tier: 1, key: FAKE, valueEncrypted: `cipher-${FAKE}`, source: "manual",
    });
    const e = await failing.then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).toBeInstanceOf(SafeDbError);
    expect(errorCode(e)).toMatch(/^[0-9A-Z]{5}$/);
    expect((e as Error).message).toMatch(/^Database error \([0-9A-Z]{5}\)$/);
    expect((e as { cause?: unknown }).cause).toBeUndefined();
    expect(everything(e)).not.toContain("ZEBRA");
    expect(everything(e)).not.toContain("my-private-detail");
    expect(everything(e)).not.toMatch(/insert into|params|profile_facts|values/i);
  });

  it("through the tenant layer too, and any log line is only kind, code, route and time", async () => {
    const user = await makeUser(db, "safelog");
    const t = tenantDb(db, user.id);
    const e = await t.agentConnections.insert({ name: FAKE, type: "not-a-real-type" as unknown as "claude" }).then(
      () => null,
      (x: unknown) => x,
    );
    expect(e).not.toBeNull();
    expect(everything(e)).not.toContain("ZEBRA");
    for (const line of output.filter((l) => l.startsWith("app-error"))) {
      const body = JSON.parse(line.slice("app-error ".length));
      expect(Object.keys(body).sort()).toEqual(["at", "code", "kind", "route"]);
    }
  });

  it("a Postgres message that quotes the value (an invalid id) is dropped, and the swallowing code writes the same safe line", async () => {
    const result = await feedbackService(db, masters, (await makeUser(db, "swallow")).id).submit({ taskId: FAKE, rating: "up", reasonCodes: [], note: "" });
    expect(result.ok).toBe(false); // the failure is swallowed and turned into "not found"
    expect(output.join("\n")).not.toContain("ZEBRA");
    expect(output.join("\n")).not.toContain("my-private-detail");
    const lines = output.filter((l) => l.startsWith("app-error"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(JSON.parse(line.slice("app-error ".length))).toMatchObject({ kind: "db", code: expect.stringMatching(/^[0-9A-Z]{5}$/) });
  });
});

describe("logSafeError", () => {
  it("writes kind, code, route and time, even when the error's own text carries the label, the SQL and the parameters", () => {
    const nasty = Object.assign(new Error(`Failed query: insert into "profile_facts" ("key") values ($1)\nparams: ${FAKE}`), {
      name: "DrizzleQueryError", params: [FAKE], query: "insert ...", cause: { code: "23505", message: FAKE, detail: `Key (key)=(${FAKE}) already exists.` },
    });
    logSafeError(nasty, "action:profile", new Date("2026-10-03T12:00:00Z"));
    expect(output).toHaveLength(1);
    expect(output[0]).toBe('app-error {"kind":"db","code":"23505","route":"action:profile","at":"2026-10-03T12:00:00.000Z"}');
    expect(output[0]).not.toContain("ZEBRA");
  });

  it("classes an ordinary error as 'app' with code none, and never logs its message", () => {
    logSafeError(new Error(`something about ${FAKE}`), "route:/x", new Date("2026-10-03T12:00:00Z"));
    expect(output[0]).toBe('app-error {"kind":"app","code":"none","route":"route:/x","at":"2026-10-03T12:00:00.000Z"}');
    expect(errorKind(new Error("x"))).toBe("app");
  });

  it("every uncaught server error goes through the same line (instrumentation), and nothing else in src writes an error's text to the log", async () => {
    const fs = await import("node:fs");
    expect(fs.readFileSync("src/instrumentation.ts", "utf8")).toContain("logSafeError(err,");
    const walk = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) && !/\.test\./.test(e.name) ? [`${d}/${e.name}`] : []));
    const offenders = walk("src")
      .filter((f) => !f.endsWith("safe-log.ts"))
      .flatMap((f) =>
        fs
          .readFileSync(f, "utf8")
          .split(/\r?\n/)
          .map((l, i) => ({ l, i }))
          .filter(({ l }) => /console\.(error|warn)\(/.test(l) && !/^\s*(\/\/|\*)/.test(l))
          .map(({ i }) => `${f}:${i + 1}`),
      );
    expect(offenders).toEqual([]);
  });
});
