import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { makeServices } from "./services";

// A new task is handed to scoring once, after the agent's reply; scoring can never slow, change or fail the agent's call (FR-F4).

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

describe("log_task hands a NEW task to scoring", () => {
  async function agent(label: string) {
    const user = await makeUser(db, label);
    const conn = await tenantDb(db, user.id).agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date() });
    return { user, conn: conn.id as string };
  }
  const input = (id: string) => ({ externalId: id, summary: "Booked the dentist", category: "booking" });

  it("calls the hook once for a new task and not for a repeat", async () => {
    const a = await agent("hook");
    const seen: string[] = [];
    const svc = makeServices(db, masters, undefined, (_u, taskId) => void seen.push(taskId));
    const first = await svc.logTask(a.user.id, a.conn, input("j1"));
    await svc.logTask(a.user.id, a.conn, input("j1"));
    expect(first.ok && seen).toEqual([first.ok ? first.taskId : "?"]);
    expect(seen).toHaveLength(1);
  });

  it("a hook that throws changes nothing about the answer the agent gets", async () => {
    const a = await agent("hook-throws");
    const svc = makeServices(db, masters, undefined, () => {
      throw new Error("no request scope");
    });
    expect(await svc.logTask(a.user.id, a.conn, input("j2"))).toMatchObject({ ok: true, status: "created" });
  });

  it("a refused task (invalid input) is never handed to scoring", async () => {
    const a = await agent("hook-invalid");
    let calls = 0;
    const svc = makeServices(db, masters, undefined, () => void calls++);
    expect(await svc.logTask(a.user.id, a.conn, { externalId: "j3", summary: "", category: "booking" })).toMatchObject({ ok: false });
    expect(calls).toBe(0);
  });
});
