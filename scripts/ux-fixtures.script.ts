import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb, makeUser } from "@/db/testing";
import { rulesService } from "@/lib/rules";
import { tasksService } from "@/lib/tasks";
import { feedbackService } from "@/lib/feedback";

// Renders the real screens, with made-up fixture data, to static HTML files so their styles can be checked in a browser without signing in as anyone.
// Run:  UX_OUT=<folder> npx vitest run --config vitest.scripts.config.mts scripts/ux-fixtures.script.ts
// It uses an in-memory copy of the database and a throw-away key made on the spot. It never reads .env and never touches a real account.

const holder: { db?: Db; person?: { id: string; email: string }; cookies: Record<string, string>; status: string } = { cookies: {}, status: "ready" };

vi.mock("@/db/client", () => ({ getDb: () => holder.db }));
vi.mock("@/lib/session", () => ({
  currentSession: async () =>
    holder.status === "signed_out" ? { status: "signed_out" } : holder.status === "attest" ? { status: "needs_attestation", person: holder.person } : { status: "ready", person: holder.person },
  requireReady: async () => holder.person,
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (n: string) => (holder.cookies[n] ? { name: n, value: holder.cookies[n] } : undefined), set: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/server", () => ({ after: () => undefined }));

const OUT = process.env.UX_OUT ?? path.join(os.tmpdir(), "rt-ux-out");
const root = process.cwd();
const masters = { current: randomBytes(32) };
process.env.MASTER_KEY = masters.current.toString("base64");

let db: Db;
const people: Record<string, { id: string; email: string }> = {};
const ids: Record<string, string> = {};

function buildCss() {
  const dir = path.join(root, "src/app/tokens");
  const parts = ["fonts", "colors", "typography", "spacing", "source-aliases", "app-literals", "base"].map((f) => fs.readFileSync(path.join(dir, `${f}.css`), "utf8"));
  parts.push(fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8"));
  return parts.join("\n").replace(/url\('\.\.\/fonts\//g, "url('fonts/");
}

async function seed() {
  db = await createTestDb();
  holder.db = db;
  const day = (offsetDays: number, h: number, m: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - offsetDays);
    d.setUTCHours(h, m, 0, 0);
    return d;
  };

  // ---- "full": every state ----
  const u = await makeUser(db, "full");
  people.full = { id: u.id, email: u.email as string };
  const t = tenantDb(db, u.id);
  const claude = await t.agentConnections.insert({ name: "Marge", type: "claude", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write", "profile:basic"], lastSeenAt: new Date() });
  const muse = await t.agentConnections.insert({ name: "Pip", type: "muse", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write", "profile:basic"], lastSeenAt: new Date() });
  const waitingChatgpt = await t.agentConnections.insert({ name: "New agent", needsName: true, suggestedType: "chatgpt", oauthClientId: "client-fixture-chatgpt-0000000001", expiresAt: new Date(Date.now() + 6 * 86_400_000) });
  ids.waitingChatgpt = waitingChatgpt.id as string;
  await t.agentConnections.insert({ name: "New agent", needsName: true, suggestedType: "muse", oauthClientId: "client-fixture-muse-000000000002", expiresAt: new Date(Date.now() - 86_400_000) });
  await t.agentConnections.insert({ name: "Old Grok", type: "grok", linkConfirmedAt: new Date(Date.now() - 5 * 86_400_000), scopes: ["rules:read"], revokedAt: new Date() });
  await t.auditLog.insert({ agentConnectionId: claude.id, actor: "agent", action: "get_rules", categoriesRead: [] });
  await t.auditLog.insert({ agentConnectionId: claude.id, actor: "agent", action: "log_task", categoriesRead: [] });
  ids.claude = claude.id as string;
  ids.muse = muse.id as string;

  const tasks = tasksService(db, masters, u.id);
  const log = async (conn: string, ext: string, summary: string, at: Date) => {
    const r = await tasks.logTask(conn, { externalId: ext, summary, category: "messaging", outcome: "completed", occurredAt: at.toISOString() });
    if (!r.ok) throw new Error(r.message);
    return r.taskId;
  };
  ids.t1 = await log(ids.claude, "t1", "Replied to a buyer about the bike and said you were free to meet on Saturday.", day(0, 9, 14));
  await log(ids.muse, "t2", "Drafted a packing list for the weekend trip and saved it as a note.", day(0, 8, 2));
  await log(ids.claude, "t3", "Booked a table for two at 7 pm on Friday.", day(1, 17, 40));
  await log(ids.muse, "t4", "Summarised three emails about the move into a short list.", day(1, 12, 15));
  await log(ids.claude, "t5", "Sent the school office the form you asked for.", day(2, 10, 5));
  await log(ids.claude, "t6", "Moved Thursday's call to Friday.", day(2, 9, 30));

  const rules = rulesService(db, u.id);
  const base = { category: "messaging", scope: "all", strength: "prefer", because: "fixture" };
  for (const [text, when] of [
    ["Ask before sharing my phone number or address.", "someone asks for contact details"],
    ["Keep emails to buyers short and friendly.", "writing to a buyer"],
    ["Don't book anything on Sundays.", "booking"],
  ] as const) {
    const p = await rules.propose({ ...base, text, when });
    if (!p.ok) throw new Error(p.message);
    await rules.approve(p.rule.id);
  }
  const fb = await feedbackService(db, masters, u.id).submit({ taskId: ids.t1, rating: "down", reasonCodes: ["overstepped_or_untrue"], note: "" });
  if (!fb.ok) throw new Error("feedback");
  const draft = await rules.propose({
    ...base, text: "Do not tell anyone I am free to meet, or that I have confirmed anything, unless I have said so.", when: "replying to a buyer", dont: "confirm a meeting", strength: "never",
    sourceFeedbackId: fb.feedback.id, draftExpiresAt: new Date(Date.now() + 25 * 60_000),
  });
  if (!draft.ok) throw new Error(draft.message);
  ids.draft = draft.rule.id;
  const saved = await rules.propose({ ...base, text: "If you are not sure what I meant, ask me first.", when: "a request is unclear", sourceFeedbackId: fb.feedback.id });
  if (!saved.ok) throw new Error(saved.message);
  await rules.approve(saved.rule.id);
  ids.saved = saved.rule.id;

  // ---- "first": one agent connected, no tasks ----
  const f = await makeUser(db, "first");
  people.first = { id: f.id, email: f.email as string };
  const firstClaude = await tenantDb(db, f.id).agentConnections.insert({ name: "Marge", type: "claude", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write", "profile:basic"] });
  ids.firstClaude = firstClaude.id as string;

  // ---- "partial": Claude has checked the rules but has not reported the test task ----
  const pa = await makeUser(db, "partial");
  people.partial = { id: pa.id, email: pa.email as string };
  const partialClaude = await tenantDb(db, pa.id).agentConnections.insert({ name: "Marge", type: "claude", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write", "profile:basic"] });
  await tenantDb(db, pa.id).auditLog.insert({ agentConnectionId: partialClaude.id, actor: "agent", action: "get_rules", categoriesRead: [] });

  // ---- "museready": Muse has made its first real call ----
  const mr = await makeUser(db, "museready");
  people.museready = { id: mr.id, email: mr.email as string };
  const readyMuse = await tenantDb(db, mr.id).agentConnections.insert({ name: "Pip", type: "muse", linkConfirmedAt: new Date(), scopes: ["rules:read", "tasks:write", "profile:basic"] });
  await tenantDb(db, mr.id).auditLog.insert({ agentConnectionId: readyMuse.id, actor: "agent", action: "get_rules", categoriesRead: [] });

  // ---- "none": nothing connected ----
  const n = await makeUser(db, "none");
  people.none = { id: n.id, email: n.email as string };

  // ---- "arrive": a Claude that has signed in and waits to be confirmed ----
  const a = await makeUser(db, "arrive");
  people.arrive = { id: a.id, email: a.email as string };
  await tenantDb(db, a.id).agentConnections.insert({ name: "New agent", needsName: true, suggestedType: "claude", oauthClientId: "client-fixture-claude-00000000003", expiresAt: new Date(Date.now() + 6 * 86_400_000) });
}

const page = (el: ReactElement) => renderToStaticMarkup(el);

async function write(name: string, who: keyof typeof people, cookies: Record<string, string>, render: () => Promise<ReactElement>) {
  holder.person = people[who];
  holder.cookies = cookies;
  const { default: Layout } = await import("@/app/layout");
  const html = page(createElement(Layout, null, await render()));
  const doc = html.replace(/(src|href)="\/(brand|icons)\//g, '$1="$2/').replace('<html lang="en">', '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="ux.css"></head>');
  fs.writeFileSync(path.join(OUT, `${name}.html`), doc);
}

describe("render the screens with fixture data", () => {
  beforeAll(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    fs.cpSync(path.join(root, "src/app/fonts"), path.join(OUT, "fonts"), { recursive: true });
    fs.cpSync(path.join(root, "public/brand"), path.join(OUT, "brand"), { recursive: true });
    fs.writeFileSync(path.join(OUT, "ux.css"), buildCss());
    await seed();
  }, 120_000);

  it("writes the pages", async () => {
    const sp = (o: Record<string, string> = {}) => Promise.resolve(o);
    const { default: Feed } = await import("@/app/feed/page");
    const { default: Rules } = await import("@/app/rules/page");
    const { default: Agents } = await import("@/app/agents/page");
    const { default: Home } = await import("@/app/page");
    const { Landing } = await import("@/app/start/Landing");
    const { default: Account } = await import("@/app/start/account/page");
    const { default: Pick } = await import("@/app/start/agents/page");
    const { default: Setup } = await import("@/app/start/setup/page");
    const { default: Confirm } = await import("@/app/agents/confirm/page");
    const { default: Finish } = await import("@/app/agents/finish/page");
    const { default: Profile } = await import("@/app/profile/page");
    const { default: Data } = await import("@/app/data/page");
    const { TaskCard } = await import("@/app/feed/TaskCard");
    const { FeedbackForm } = await import("@/app/feed/FeedbackForm");
    const { Nav } = await import("@/app/ui");
    const { default: Privacy } = await import("@/app/privacy/page");
    const { default: Terms } = await import("@/app/terms/page");
    const { default: Welcome } = await import("@/app/welcome/page");

    const picked = { rt_picked: "claude,muse" };
    const jobs: [string, keyof typeof people, Record<string, string>, () => Promise<ReactElement>][] = [
      ["feed", "full", {}, async () => (await Feed({ searchParams: sp() })) as ReactElement],
      ["feed-all", "full", {}, async () => (await Feed({ searchParams: sp({ unreviewed: "0" }) })) as ReactElement],
      [
        "feed-sheet", "full", {},
        async () => {
          const view = (await tasksService(db, masters, people.full.id).feed({ limit: 1, withDetails: true }))[0];
          return createElement("div", null, createElement(Nav, { current: "feed" }), createElement("main", { className: "page" }, createElement("h1", null, "What your agents did"),
            createElement(TaskCard, { task: view }, createElement(FeedbackForm, { taskId: view.id, initialOpen: true, context: { agent: view.agentName, when: "today 09:14 UTC", text: view.summary } }))));
        },
      ],
      ["rules-draft", "full", {}, async () => (await Rules({ searchParams: sp({ draft: ids.draft }) })) as ReactElement],
      ["rules-saved", "full", {}, async () => (await Rules({ searchParams: sp({ saved: ids.saved, message: "Rule saved. Your connected agents can read it." }) })) as ReactElement],
      ["agents", "full", {}, async () => (await Agents({ searchParams: sp() })) as ReactElement],
      ["home", "full", {}, async () => (await Home()) as ReactElement],
      ["home-first", "first", {}, async () => (await Home()) as ReactElement],
      ["home-none", "none", { ...picked, rt_later: "1" }, async () => (await Home()) as ReactElement],
      ["landing", "none", {}, async () => createElement(Landing)],
      [
        "account", "none", {},
        async () => {
          holder.status = "signed_out"; // this screen is for someone who is not signed in yet
          try {
            return (await Account()) as ReactElement;
          } finally {
            holder.status = "ready";
          }
        },
      ],
      ["pick", "none", {}, async () => (await Pick()) as ReactElement],
      ["setup-claude", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "claude" }) })) as ReactElement],
      ["setup-chatgpt", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "chatgpt" }) })) as ReactElement],
      ["setup-grok", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "grok" }) })) as ReactElement],
      ["setup-muse", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "muse" }) })) as ReactElement],
      ["setup-claude-instruction", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "claude", step: "instruction" }) })) as ReactElement],
      ["setup-chatgpt-instruction", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "chatgpt", step: "instruction" }) })) as ReactElement],
      ["setup-claude-verify-waiting", "first", picked, async () => (await Setup({ searchParams: sp({ agent: "claude", step: "verify" }) })) as ReactElement],
      ["setup-claude-verify-partial", "partial", picked, async () => (await Setup({ searchParams: sp({ agent: "claude", step: "verify" }) })) as ReactElement],
      ["setup-claude-verify-ready", "full", picked, async () => (await Setup({ searchParams: sp({ agent: "claude", step: "verify" }) })) as ReactElement],
      ["setup-grok-another-way", "none", picked, async () => (await Setup({ searchParams: sp({ agent: "grok", another: "1" }) })) as ReactElement],
      ["setup-muse-ready", "museready", picked, async () => (await Setup({ searchParams: sp({ agent: "muse" }) })) as ReactElement],
      ["setup-confirm", "arrive", picked, async () => (await Setup({ searchParams: sp({ agent: "claude" }) })) as ReactElement],
      ["agents-confirm", "full", {}, async () => (await Confirm({ searchParams: sp({ agent: ids.waitingChatgpt }) })) as ReactElement],
      ["agents-finish-muse", "full", {}, async () => (await Finish({ searchParams: sp({ agent: ids.muse }) })) as ReactElement],
      ["agents-finish-claude", "first", {}, async () => (await Finish({ searchParams: sp({ agent: ids.firstClaude }) })) as ReactElement],
      [
        "welcome", "none", {},
        async () => {
          holder.status = "attest"; // this screen is for someone who has signed in but not yet ticked the box
          try {
            return (await Welcome({ searchParams: sp() })) as ReactElement;
          } finally {
            holder.status = "ready";
          }
        },
      ],
      ["privacy", "none", {}, async () => createElement(Privacy)],
      ["terms", "none", {}, async () => createElement(Terms)],
      ["profile", "full", {}, async () => (await Profile({ searchParams: sp() })) as ReactElement],
      ["data", "full", {}, async () => (await Data({ searchParams: sp() })) as ReactElement],
    ];
    const failed: string[] = [];
    for (const [name, who, cookies, render] of jobs) {
      try {
        await write(name, who, cookies, render);
      } catch (e) {
        failed.push(`${name}: ${(e as Error).message.slice(0, 160)}`);
      }
    }
    console.log(`wrote ${jobs.length - failed.length} pages to ${OUT}`);
    expect(failed).toEqual([]);
  }, 300_000);
});
