import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { feedbackService, type FeedbackResult, type FeedbackView } from "./feedback";
import { tasksService } from "./tasks";

let db: Db;
const masters = { current: randomBytes(32) };
beforeAll(async () => {
  db = await createTestDb();
});

async function person(label: string) {
  const user = await makeUser(db, label);
  const t = tenantDb(db, user.id);
  const conn = await t.agentConnections.insert({ name: "Marge", type: "muse", linkConfirmedAt: new Date() });
  const logged = await tasksService(db, masters, user.id).logTask(conn.id as string, { externalId: "j1", summary: "Agreed to a price", category: "messaging" });
  if (!logged.ok) throw new Error("setup");
  return { user, t, svc: feedbackService(db, masters, user.id), taskId: logged.taskId };
}
const ok = (r: FeedbackResult): FeedbackView => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r.feedback;
};

describe("feedback (FR-D1 to FR-D5)", () => {
  it("a thumbs up is one record and keeps no reasons or note", async () => {
    const p = await person("up");
    const f = ok(await p.svc.submit({ taskId: p.taskId, rating: "up", reasonCodes: ["tone"], note: "nice" }));
    expect(f.rating).toBe("up");
    expect(f.reasonCodes).toEqual([]);
    expect(f.note).toBeUndefined();
  });

  it("a thumbs down stores reason codes, and the note is stored encrypted", async () => {
    const p = await person("down");
    const note = "Never agree to a price or a time without checking with me first";
    ok(await p.svc.submit({ taskId: p.taskId, rating: "down", reasonCodes: ["overstepped_or_untrue", "shouldnt_have_done_this"], note }));
    const row = (await p.t.feedback.list())[0];
    expect(row.reasonCodes).toEqual(["overstepped_or_untrue", "shouldnt_have_done_this"]);
    expect(String(row.noteEncrypted)).not.toContain("Never agree");
    const current = await p.svc.current({ withNotes: true });
    expect(current.get(p.taskId)?.note).toBe(note);
    expect((await p.svc.current()).get(p.taskId)?.note).toBeUndefined();
  });

  it("feedback is never edited: a new rating replaces the old one and the old one stays", async () => {
    const p = await person("replace");
    const first = ok(await p.svc.submit({ taskId: p.taskId, rating: "down", reasonCodes: ["other"] }));
    const second = ok(await p.svc.submit({ taskId: p.taskId, rating: "up" }));
    const rows = await p.t.feedback.list();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === second.id)?.supersedesId).toBe(first.id);
    expect(rows.find((r) => r.id === first.id)?.rating).toBe("down");
    expect((await p.svc.current()).get(p.taskId)?.rating).toBe("up");
    expect((await p.svc.history(p.taskId)).map((h) => h.rating)).toEqual(["down", "up"]);
  });

  it("rejects an unknown rating or reason, and a task that is not yours", async () => {
    const p = await person("bad");
    const other = await person("bad-other");
    expect((await p.svc.submit({ taskId: p.taskId, rating: "meh" })).ok).toBe(false);
    expect((await p.svc.submit({ taskId: p.taskId, rating: "down", reasonCodes: ["nope"] })).ok).toBe(false);
    const theirs = await p.svc.submit({ taskId: other.taskId, rating: "up" });
    expect(theirs.ok).toBe(false);
    expect(await other.t.feedback.list()).toHaveLength(0);
  });

  it("cleans markup out of the note and caps its length", async () => {
    const p = await person("note");
    ok(await p.svc.submit({ taskId: p.taskId, rating: "down", note: `<b>Ask me</b> ${"x".repeat(2000)}` }));
    const note = (await p.svc.current({ withNotes: true })).get(p.taskId)?.note ?? "";
    expect(note).not.toContain("<");
    expect(note.length).toBeLessThanOrEqual(1000);
  });
});

describe("ID and card numbers are turned away from notes (open item 18)", () => {
  it("a thumbs-down note with a card number is refused and nothing is stored", async () => {
    const p = await person("cardnote");
    const r = await p.svc.submit({ taskId: p.taskId, rating: "down", reasonCodes: ["other"], note: "Use my card 4111 1111 1111 1111 next time" });
    expect(r).toMatchObject({ ok: false, reason: "invalid_input" });
    expect(await p.t.feedback.list()).toHaveLength(0);
  });
});
