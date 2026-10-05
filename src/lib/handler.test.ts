import { randomBytes } from "node:crypto";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { createTestDb } from "@/db/testing";
import { confirmConnection, resolveOAuthConnection, revokeConnection, type Connection } from "./connections";
import { handleMcp, type McpEnv } from "./handler";
import { attestAdult, findOrCreateUser } from "./identity";
import { profileService } from "./profile";
import { rulesService } from "./rules";
import { makeServices } from "./services";
import { tasksService } from "./tasks";
import { issueDemoToken, resolveBearerToken } from "./tokens";

const ISSUER = "https://example.authkit.app";
const AUDIENCE = "https://agent-care.vercel.app/mcp";
const METADATA_URL = "https://agent-care.vercel.app/.well-known/oauth-protected-resource/mcp";
const masters = { current: randomBytes(32) };

const good = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const goodJwk = { ...(await exportJWK(good.publicKey)), kid: "good", alg: "RS256", use: "sig" };

let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});

const oauthConfig = () => ({
  oauth: { issuer: ISSUER, audience: AUDIENCE, keys: createLocalJWKSet({ keys: [goodJwk] }) },
  resourceMetadataUrl: METADATA_URL,
});
/** The connection check switched OFF, as on the live site today. */
const checkOff = (): McpEnv => ({ allowedHosts: ["localhost"], auth: oauthConfig() });
/** The connection check switched ON, with the real services on a test database. */
const checkOn = (): McpEnv => ({
  allowedHosts: ["localhost"],
  auth: oauthConfig(),
  services: makeServices(db, masters),
  resolveConnection: (input) => resolveOAuthConnection(db, input),
  resolveBearer: (token) => resolveBearerToken(db, token),
});

function sign(opts: { key?: CryptoKey; issuer?: string; audience?: string; expires?: string; sub?: string; clientId?: string | null } = {}) {
  return new SignJWT({ sub: opts.sub ?? "user_1", ...(opts.clientId === null ? {} : { client_id: opts.clientId ?? "opaque-client-code" }) })
    .setProtectedHeader({ alg: "RS256", kid: "good" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(opts.expires ?? "5m")
    .sign(opts.key ?? good.privateKey);
}

function mcpRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "localhost:3000", ...headers },
    body: JSON.stringify(body),
  });
}

// The server may answer as plain JSON or as a one-message event stream; read either.
async function readJson(res: Response) {
  const text = await res.text();
  const dataLine = text.split(/\r?\n/).find((l) => l.startsWith("data:"));
  return JSON.parse(text.startsWith("event:") && dataLine ? dataLine.slice(5) : text);
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const toolCall = (name: string, args: unknown = {}) => ({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } });
const withBearer = (token: string) => ({ authorization: `Bearer ${token}` });

describe("refusing callers", () => {
  it("returns 401 with a WWW-Authenticate header pointing to the metadata when no token is sent", async () => {
    const res = await handleMcp(mcpRequest(listTools), checkOff());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${METADATA_URL}"`);
  });

  it("returns 401 for a garbage token", async () => {
    expect((await handleMcp(mcpRequest(listTools, withBearer("nope")), checkOff())).status).toBe(401);
  });

  it("returns 401 for our own kind of token when bearer checking is not switched on", async () => {
    expect((await handleMcp(mcpRequest(listTools, withBearer("rt_deadbeef_" + "a".repeat(43))), checkOff())).status).toBe(401);
  });
});

describe("OAuth access tokens", () => {
  it("accepts a valid token and offers only the status tool while the connection check is off", async () => {
    const res = await handleMcp(mcpRequest(listTools, withBearer(await sign())), checkOff());
    expect(res.status).toBe(200);
    expect((await readJson(res)).result.tools.map((t: { name: string }) => t.name)).toEqual(["hello"]);
  });

  it.each([
    ["signed with a different key", () => sign({ key: other.privateKey })],
    ["for a different audience", () => sign({ audience: "https://someone-else.example/mcp" })],
    ["from a different issuer", () => sign({ issuer: "https://evil.example" })],
    ["expired", () => sign({ expires: "-1m" })],
  ])("rejects a token %s", async (_name, make) => {
    expect((await handleMcp(mcpRequest(listTools, withBearer(await make())), checkOff())).status).toBe(401);
  });
});

async function person(attest = true) {
  const sub = `user_ep_${crypto.randomUUID()}`;
  const user = await findOrCreateUser(db, { authSubject: sub });
  if (attest) await attestAdult(db, user.id);
  return { sub, user, t: tenantDb(db, user.id), profile: profileService(db, masters, user.id) };
}
const asAgent = async (sub: string, body: unknown, clientId: string | null = "opaque-client-code") =>
  handleMcp(mcpRequest(body, withBearer(await sign({ sub, clientId }))), checkOn());
const toolNames = async (sub: string, clientId?: string | null) => {
  const res = await asAgent(sub, listTools, clientId);
  expect(res.status).toBe(200);
  return ((await readJson(res)).result.tools as { name: string }[]).map((t) => t.name).sort();
};
async function confirmed(sub: string, t: ReturnType<typeof tenantDb>, extraScopes: string[] = [], clientId = "opaque-client-code", type: "muse" | "claude" | "chatgpt" = "muse") {
  await toolNames(sub, clientId);
  const conn = ((await t.agentConnections.list()) as Connection[]).find((c) => c.oauthClientId === clientId)!;
  await confirmConnection(t, conn.id, { type, name: type === "muse" ? "Marge" : type, extraScopes });
  return conn;
}
const seed = async (p: Awaited<ReturnType<typeof person>>) => {
  await p.profile.add({ category: "preferences", key: "Tone", value: "Casual with friends" });
  await p.profile.add({ category: "contacts", key: "Dentist", value: "Front desk, ask for Priya" });
  await p.profile.add({ category: "family", key: "Theo", value: "Needs 15 minutes of notice before leaving" });
};
const readProfile = async (sub: string, categories?: string[]) => {
  const res = await asAgent(sub, toolCall("get_care_profile", categories ? { categories } : {}));
  return readJson(res);
};
const returnedCategories = (body: { result: { content: { text: string }[] } }) =>
  (JSON.parse(body.result.content[0].text).facts as { category: string }[]).map((f) => f.category).sort();

const ALL_TOOLS = ["get_care_profile", "get_rules", "hello", "log_task", "propose_correction"];
const CONFIRM_MESSAGE = "Confirm this agent in Rare Tomato (open Connected Agents), then try again.";
const DATA_TOOL_CALLS: [string, unknown][] = [
  ["get_care_profile", { categories: ["preferences", "contacts", "family"] }],
  ["get_rules", {}],
  ["log_task", { external_id: "x-1", summary: "Tried to log", category: "other" }],
  ["propose_correction", { user_said: "No, not mornings before ten", category: "scheduling" }],
];
const refusalOf = async (res: Response) => {
  const body = await readJson(res);
  return { isError: body.result?.isError === true, payload: body.result?.content?.[0]?.text ? JSON.parse(body.result.content[0].text) : null };
};
/** Services that fail the test if anything reads or writes personal data, while still recording the audit log. */
const spyServices = () => {
  const touched: string[] = [];
  const real = makeServices(db, masters);
  const services: typeof real = {
    facts: async () => { touched.push("facts"); throw new Error("data was read"); },
    rules: async () => { touched.push("rules"); throw new Error("data was read"); },
    logTask: async () => { touched.push("logTask"); throw new Error("data was written"); },
    proposeCorrection: async () => { touched.push("proposeCorrection"); throw new Error("data was written"); },
    audit: (entry) => real.audit(entry),
    callsSince: (u, c, s) => real.callsSince(u, c, s),
  };
  return { touched, env: (): McpEnv => ({ ...checkOn(), services }) };
};

describe("an unassigned agent gets nothing (FR-A2, FR-A3)", () => {
  it("is shown the same full tool list as every other agent", async () => {
    const p = await person();
    await seed(p);
    expect(await toolNames(p.sub)).toEqual(ALL_TOOLS);
  });

  it("every agent gets the identical list: unassigned, confirmed, reduced access, and bearer alike", async () => {
    const unassigned = await person();
    const confirmedAgent = await person();
    const reduced = await person();
    const bearer = await person();
    await toolNames(unassigned.sub);
    await confirmed(confirmedAgent.sub, confirmedAgent.t);
    const conn = await confirmed(reduced.sub, reduced.t);
    await reduced.t.agentConnections.update(conn.id, { scopes: ["profile:basic"] });
    const { token } = await issueDemoToken(bearer.t);
    const viaBearer = ((await readJson(await handleMcp(mcpRequest(listTools, withBearer(token)), checkOn()))).result.tools as { name: string }[]).map((x) => x.name).sort();
    const lists = [await toolNames(unassigned.sub), await toolNames(confirmedAgent.sub), await toolNames(reduced.sub), viaBearer];
    for (const list of lists) expect(list).toEqual(ALL_TOOLS);
  });

  it("refuses every data tool with the plain 'confirm this agent' message", async () => {
    const p = await person();
    await seed(p);
    for (const [name, args] of DATA_TOOL_CALLS) {
      const { isError, payload } = await refusalOf(await asAgent(p.sub, toolCall(name, args)));
      expect(isError).toBe(true);
      expect(payload).toEqual({ error: "not_confirmed", message: CONFIRM_MESSAGE });
    }
    expect(await tasksService(db, masters, p.user.id).feed()).toEqual([]);
  });

  it("refuses BEFORE any data is touched: nothing is read or written", async () => {
    const p = await person();
    await seed(p);
    const spy = spyServices();
    for (const [name, args] of DATA_TOOL_CALLS) {
      const res = await handleMcp(mcpRequest(toolCall(name, args), withBearer(await sign({ sub: p.sub }))), spy.env());
      expect((await refusalOf(res)).isError).toBe(true);
    }
    expect(spy.touched).toEqual([]);
  });

  it("refuses before touching data for a confirmed agent that lacks the permission too", async () => {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    await p.t.agentConnections.update(conn.id, { scopes: ["profile:basic"] }); // no rules, no task permission
    const spy = spyServices();
    for (const name of ["get_rules", "log_task", "propose_correction"]) {
      const args = DATA_TOOL_CALLS.find(([n]) => n === name)![1];
      const res = await handleMcp(mcpRequest(toolCall(name, args), withBearer(await sign({ sub: p.sub }))), spy.env());
      const { isError, payload } = await refusalOf(res);
      expect(isError).toBe(true);
      expect(payload.error).toBe("forbidden_scope");
    }
    expect(spy.touched).toEqual([]);
  });

  it("writes every refused call to the audit log, without any personal data", async () => {
    const p = await person();
    await seed(p);
    for (const [name, args] of DATA_TOOL_CALLS) await readJson(await asAgent(p.sub, toolCall(name, args)));
    const rows = (await p.t.auditLog.list()) as { action: string; actor: string; categoriesRead: string[]; agentConnectionId: string }[];
    expect(rows.map((r) => r.action).sort()).toEqual(["refused:get_care_profile", "refused:get_rules", "refused:log_task", "refused:propose_correction"]);
    for (const r of rows) {
      expect(r.actor).toBe("agent");
      expect(r.categoriesRead).toEqual([]);
      expect(r.agentConnectionId).toBeTruthy();
    }
    expect(JSON.stringify(rows)).not.toMatch(/Theo|Priya|Casual|Tried to log/);
  });

  it("can still call the status tool, and that is not refused", async () => {
    const p = await person();
    const body = await readJson(await asAgent(p.sub, toolCall("hello", { name: "Lia" })));
    expect(body.result.content[0].text).toBe("Hello, Lia!");
    expect(await p.t.auditLog.list()).toEqual([]);
  });
});

describe("scopes decide what a confirmed agent can read (FR-A3)", () => {
  it("with the default scopes, only preferences: never contacts or family", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t);
    expect(await toolNames(p.sub)).toEqual(ALL_TOOLS);
    expect(returnedCategories(await readProfile(p.sub))).toEqual(["preferences"]);
  });

  it("asking for family without the family scope returns zero family facts", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t);
    const body = await readProfile(p.sub, ["family", "contacts"]);
    expect(returnedCategories(body)).toEqual([]);
    expect(JSON.stringify(body)).not.toMatch(/Theo|Priya/);
  });

  it("family and contacts appear only when the person chose those scopes", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t, ["profile:contacts"]);
    expect(returnedCategories(await readProfile(p.sub))).toEqual(["contacts", "preferences"]);
    const conn = ((await p.t.agentConnections.list()) as Connection[])[0];
    await confirmConnection(p.t, conn.id, { type: "muse", name: "Marge", extraScopes: ["profile:contacts", "profile:family"] });
    expect(returnedCategories(await readProfile(p.sub))).toEqual(["contacts", "family", "preferences"]);
  });

  it("a scope change applies on the very next call", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t, ["profile:family"]);
    expect(returnedCategories(await readProfile(p.sub))).toContain("family");
    const conn = ((await p.t.agentConnections.list()) as Connection[])[0];
    await p.t.agentConnections.update(conn.id, { scopes: ["profile:basic"] });
    expect(returnedCategories(await readProfile(p.sub))).toEqual(["preferences"]);
  });

  it("returns the decrypted values, marked as data", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t);
    const facts = JSON.parse((await readProfile(p.sub)).result.content[0].text).facts;
    expect(facts[0].value).toBe("Casual with friends");
  });

  it("get_rules returns the (empty) rule list and a version tag", async () => {
    const p = await person();
    await confirmed(p.sub, p.t);
    const body = await readJson(await asAgent(p.sub, toolCall("get_rules")));
    const parsed = JSON.parse(body.result.content[0].text);
    expect(parsed.rules).toEqual([]);
    expect(parsed.rules_version).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("one person's agent never reaches another person's data", () => {
  it("two people with the same agent identity each see only their own facts", async () => {
    const a = await person();
    const b = await person();
    await a.profile.add({ category: "preferences", key: "Tone", value: "Only A knows this" });
    await b.profile.add({ category: "preferences", key: "Tone", value: "Only B knows this" });
    const shared = "https://claude.ai/oauth/client-metadata.json";
    await confirmed(a.sub, a.t, [], shared);
    await confirmed(b.sub, b.t, [], shared);
    const seenByA = JSON.stringify(await readProfileAs(a.sub, shared));
    const seenByB = JSON.stringify(await readProfileAs(b.sub, shared));
    expect(seenByA).toContain("Only A knows this");
    expect(seenByA).not.toContain("Only B");
    expect(seenByB).toContain("Only B knows this");
    expect(seenByB).not.toContain("Only A");
  });
});
const readProfileAs = async (sub: string, clientId: string) => readJson(await asAgent(sub, toolCall("get_care_profile"), clientId));

describe("a detail limited to chosen agents (open item 19), through the real endpoint", () => {
  it("get_care_profile gives it to the chosen agent only; the other agent's reply has no trace of it and is not an error", async () => {
    const p = await person();
    const clientA = "https://claude.ai/oauth/client-metadata.json";
    const clientB = "https://chatgpt.com/oauth/client-metadata-limited.json";
    const a = await confirmed(p.sub, p.t, [], clientA, "claude");
    await confirmed(p.sub, p.t, [], clientB, "chatgpt");
    const limited = await p.profile.add({ category: "preferences", key: "Limited", value: "Seen by Claude only" });
    await p.profile.add({ category: "preferences", key: "Open", value: "Seen by both" });
    if (!limited.ok) throw new Error("setup");
    expect((await p.profile.setVisibility(limited.fact.id, [a.id])).ok).toBe(true);

    const forA = await readProfileAs(p.sub, clientA);
    const forB = await readProfileAs(p.sub, clientB);
    expect(JSON.stringify(forA)).toContain("Seen by Claude only");
    expect(JSON.stringify(forB)).toContain("Seen by both");
    expect(JSON.stringify(forB)).not.toMatch(/Seen by Claude only|Limited/);
    expect(forB.result.isError).not.toBe(true);
  });
});

describe("a flooding agent is rate limited (per connection, counted in the database)", () => {
  it("after 60 recorded calls in a minute, the next call reads nothing, writes nothing and says so; another agent is unaffected", async () => {
    const p = await person();
    const a = await confirmed(p.sub, p.t, [], "https://claude.ai/oauth/client-metadata.json", "claude");
    await confirmed(p.sub, p.t, [], "https://chatgpt.com/oauth/client-metadata-rl.json", "chatgpt");
    for (let i = 0; i < 60; i++) await p.t.auditLog.insert({ agentConnectionId: a.id, actor: "agent", action: "get_rules", categoriesRead: [] });
    const res = await readJson(await asAgent(p.sub, toolCall("get_rules"), "https://claude.ai/oauth/client-metadata.json"));
    expect(res.result.isError).toBe(true);
    expect(JSON.parse(res.result.content[0].text).error).toBe("rate_limited");
    const logged = await readJson(await asAgent(p.sub, toolCall("log_task", { external_id: "flood-1", summary: "x", category: "other" }), "https://claude.ai/oauth/client-metadata.json"));
    expect(logged.result.isError).toBe(true);
    expect(await p.t.tasks.list()).toHaveLength(0);
    expect((await p.t.auditLog.list()).length).toBe(60); // nothing more was written
    const other = await readJson(await asAgent(p.sub, toolCall("get_rules"), "https://chatgpt.com/oauth/client-metadata-rl.json"));
    expect(other.result.isError).not.toBe(true);
  });
});

describe("small hardening from the run-2 review", () => {
  it("a request for a wrong hostname is refused before any connection is created or touched", async () => {
    const p = await person();
    const token = await sign({ sub: p.sub, clientId: "https://claude.ai/oauth/client-metadata.json" });
    const res = await handleMcp(mcpRequest(listTools, { ...withBearer(token), host: "evil.example" }), checkOn());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await p.t.agentConnections.list()).toHaveLength(0);
  });

  it("asking for no categories reads nothing and is not recorded as 'asked for your details'", async () => {
    const p = await person();
    await confirmed(p.sub, p.t, [], "https://claude.ai/oauth/client-metadata.json", "claude");
    await readJson(await asAgent(p.sub, toolCall("get_care_profile", { categories: [] }), "https://claude.ai/oauth/client-metadata.json"));
    expect((await p.t.auditLog.list()).filter((r) => (r as { action: string }).action === "get_care_profile")).toHaveLength(0);
  });
});

describe("every agent read is recorded (FR-H4)", () => {
  it("writes an audit row with the agent, the action and the categories, but never the values", async () => {
    const p = await person();
    await seed(p);
    await confirmed(p.sub, p.t, ["profile:family"]);
    await readProfile(p.sub, ["preferences", "family"]);
    const rows = (await p.t.auditLog.list()) as { action: string; actor: string; categoriesRead: string[]; agentConnectionId: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ action: "get_care_profile", actor: "agent" });
    expect([...rows[0].categoriesRead].sort()).toEqual(["family", "preferences"]);
    expect(JSON.stringify(rows)).not.toMatch(/Theo|Casual|minutes/);
  });
});

describe("the connection check itself", () => {
  it("refuses a person who has not confirmed they are 18 or older", async () => {
    const p = await person(false);
    const res = await asAgent(p.sub, listTools);
    expect(res.status).toBe(403);
    expect((await res.json()).message).toMatch(/finish setting up/i);
  });

  it("refuses a token that does not say which agent it belongs to", async () => {
    const p = await person();
    expect((await asAgent(p.sub, listTools, null)).status).toBe(403);
  });

  it("returns 401 on the very next call after the connection is revoked", async () => {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    await revokeConnection(p.t, conn.id);
    expect((await asAgent(p.sub, listTools)).status).toBe(401);
  });
});

describe("bearer tokens for the demo agent and local testing (spec 7.2 path A)", () => {
  it("issues a token that works once, is stored only as a hash, and offers the default tools", async () => {
    const p = await person();
    await seed(p);
    const { connection, token } = await issueDemoToken(p.t);
    const row = await p.t.agentConnections.get(connection.id);
    expect(JSON.stringify(row)).not.toContain(token);
    const secret = token.replace(/^rt_[0-9a-f]{8}_/, ""); // the secret can itself contain underscores
    expect(secret.length).toBeGreaterThan(30);
    expect(JSON.stringify(row)).not.toContain(secret);
    expect(String(row?.tokenHash)).toMatch(/^[0-9a-f]{64}$/);
    const res = await handleMcp(mcpRequest(listTools, withBearer(token)), checkOn());
    expect(res.status).toBe(200);
    expect(((await readJson(res)).result.tools as { name: string }[]).map((t) => t.name).sort()).toEqual(ALL_TOOLS);
  });

  it("reads only this person's data, and only the categories granted", async () => {
    const a = await person();
    const b = await person();
    await seed(a);
    await b.profile.add({ category: "preferences", key: "Tone", value: "Belongs to B" });
    const { token } = await issueDemoToken(a.t);
    const body = await readJson(await handleMcp(mcpRequest(toolCall("get_care_profile", { categories: ["preferences", "family"] }), withBearer(token)), checkOn()));
    expect(returnedCategories(body)).toEqual(["preferences"]);
    expect(JSON.stringify(body)).not.toContain("Belongs to B");
  });

  it("rejects a wrong secret, an unknown prefix, and a malformed token", async () => {
    const p = await person();
    const { token } = await issueDemoToken(p.t);
    const [rt, prefix] = token.split("_");
    for (const bad of [`${rt}_${prefix}_${"x".repeat(43)}`, `rt_00000000_${"x".repeat(43)}`, "rt_short"]) {
      expect((await handleMcp(mcpRequest(listTools, withBearer(bad)), checkOn())).status).toBe(401);
    }
  });

  it("returns 401 on the very next call after the token's connection is revoked", async () => {
    const p = await person();
    const { connection, token } = await issueDemoToken(p.t);
    expect((await handleMcp(mcpRequest(listTools, withBearer(token)), checkOn())).status).toBe(200);
    await revokeConnection(p.t, connection.id);
    expect((await handleMcp(mcpRequest(listTools, withBearer(token)), checkOn())).status).toBe(401);
  });

  it("rotating the token stops the old one at once and the new one works", async () => {
    const p = await person();
    const first = await issueDemoToken(p.t);
    const second = await issueDemoToken(p.t);
    expect(second.connection.id).toBe(first.connection.id);
    expect(second.token).not.toBe(first.token);
    expect((await handleMcp(mcpRequest(listTools, withBearer(first.token)), checkOn())).status).toBe(401);
    expect((await handleMcp(mcpRequest(listTools, withBearer(second.token)), checkOn())).status).toBe(200);
  });
});

describe("agents record what they did (log_task, FR-C1)", () => {
  const logCall = (external: string, extra: Record<string, unknown> = {}) =>
    toolCall("log_task", { external_id: external, summary: "Booked the dentist for Tuesday", category: "booking", ...extra });
  const result = async (res: Response) => JSON.parse((await readJson(res)).result.content[0].text);

  it("saves a task for the person, labelled by the agent's own connection, and repeats do not duplicate", async () => {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    const first = await result(await asAgent(p.sub, logCall("job-1")));
    expect(first.status).toBe("created");
    const again = await result(await asAgent(p.sub, logCall("job-1")));
    expect(again).toEqual({ task_id: first.task_id, status: "duplicate" });
    const feed = await tasksService(db, masters, p.user.id).feed();
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ connectionId: conn.id, agentName: "Marge", summary: "Booked the dentist for Tuesday" });
  });

  it("an updated outcome changes the same task", async () => {
    const p = await person();
    await confirmed(p.sub, p.t);
    const first = await result(await asAgent(p.sub, logCall("job-1", { outcome: "needs_user" })));
    const next = await result(await asAgent(p.sub, logCall("job-1", { outcome: "completed" })));
    expect(next).toEqual({ task_id: first.task_id, status: "updated" });
  });

  it("is recorded in the audit log", async () => {
    const p = await person();
    await confirmed(p.sub, p.t);
    await readJson(await asAgent(p.sub, logCall("job-1"))); // wait for the response so the work has finished
    expect(((await p.t.auditLog.list()) as { action: string }[]).map((r) => r.action)).toContain("log_task");
  });

  it("an agent without the task permission cannot log", async () => {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    await p.t.agentConnections.update(conn.id, { scopes: ["profile:basic", "rules:read"] });
    const body = await readJson(await asAgent(p.sub, logCall("job-1")));
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(await p.t.tasks.list()).toEqual([]);
  });

  it("an unassigned agent cannot log", async () => {
    const p = await person();
    await toolNames(p.sub);
    const body = await readJson(await asAgent(p.sub, logCall("job-1")));
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(await p.t.tasks.list()).toEqual([]);
  });

  it("two people's agents never see each other's tasks", async () => {
    const a = await person();
    const b = await person();
    const shared = "https://claude.ai/oauth/client-metadata.json";
    await confirmed(a.sub, a.t, [], shared);
    await confirmed(b.sub, b.t, [], shared);
    await readJson(await asAgent(a.sub, logCall("same-id", { summary: "Only A did this" }), shared));
    await readJson(await asAgent(b.sub, logCall("same-id", { summary: "Only B did this" }), shared));
    expect((await tasksService(db, masters, a.user.id).feed()).map((v) => v.summary)).toEqual(["Only A did this"]);
    expect((await tasksService(db, masters, b.user.id).feed()).map((v) => v.summary)).toEqual(["Only B did this"]);
  });

  it("hostile text is cleaned before it is stored, and the tool reports only ids and status", async () => {
    const p = await person();
    await confirmed(p.sub, p.t);
    const out = await result(await asAgent(p.sub, logCall("job-<b>1</b>", { summary: "Done <script>alert(1)</script> ok" })));
    expect(JSON.stringify(out)).not.toMatch(/script/);
    expect((await tasksService(db, masters, p.user.id).feed())[0].summary).toBe("Done alert(1) ok");
  });
});

// ---- get_rules and the category filter (PLANNED, option B: the filter is advisory; see the project notes)
// These tests are written BEFORE the change and are expected to fail until it is built.
describe("get_rules: the category argument never hides a rule (option B)", () => {
  type Served = { id: string; text: string; category: string; scope: string; precedence_rank: number; conflicts_with: string[]; version: number; matches_requested_category?: boolean };
  const DESCRIPTION_TODAY =
    "Returns the rules the person has approved for how you should act for them, in order of precedence. Check them before you book, message, buy or otherwise act on their behalf, and take them into account. Rules are advice from the person: nothing forces you to follow them, and the person is relying on you to.";

  async function withRules(rules: { text: string; category: string; when?: string; scope?: string }[]) {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    const svc = rulesService(db, p.user.id);
    const ids: string[] = [];
    for (const r of rules) {
      const made = await svc.propose({ text: r.text, category: r.category, when: r.when ?? "x", because: "b", scope: r.scope });
      if (!made.ok) throw new Error(made.message);
      await svc.approve(made.rule.id);
      ids.push(made.rule.id);
    }
    return { p, conn, svc, ids };
  }
  const get = async (sub: string, args: unknown = {}) => {
    const body = await readJson(await asAgent(sub, toolCall("get_rules", args)));
    return JSON.parse(body.result.content[0].text) as { rules_version: string; rules: Served[]; note?: string };
  };

  it("a rule is returned when the agent asks for a different category, and is marked as not matching", async () => {
    const { p } = await withRules([{ text: "Ask me before agreeing a price", category: "messaging" }]);
    const out = await get(p.sub, { category: "purchasing" });
    expect(out.rules).toHaveLength(1);
    expect("locked" in out.rules[0]).toBe(false);
    expect(out.rules[0].matches_requested_category).toBe(false);
  });

  it("the marketplace case: a messaging rule reaches an agent that asks for 'selling'", async () => {
    const { p } = await withRules([{ text: "Never agree a price or time", category: "messaging" }]);
    const out = await get(p.sub, { category: "selling" });
    expect(out.rules.map((r) => r.text)).toEqual(["Never agree a price or time"]);
  });

  it("puts matching rules first and flags them, but keeps the precedence rank from spec 6.4 unchanged", async () => {
    const { p } = await withRules([
      { text: "booking rule", category: "booking", when: "a much longer and narrower condition than the other one" },
      { text: "plain messaging rule", category: "messaging" },
    ]);
    const unfiltered = await get(p.sub);
    const filtered = await get(p.sub, { category: "messaging" });
    expect(filtered.rules.map((r) => r.text)).toEqual(["plain messaging rule", "booking rule"]);
    expect(filtered.rules.map((r) => r.matches_requested_category)).toEqual([true, false]);
    const rank = (o: typeof unfiltered) => Object.fromEntries(o.rules.map((r) => [r.text, r.precedence_rank]));
    expect(rank(filtered)).toEqual(rank(unfiltered)); // the narrower rule still ranks first in precedence
    expect(rank(unfiltered)["booking rule"]).toBe(1);
  });

  it("an unknown category returns every rule, none marked as matching, with a note listing the valid categories", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }, { text: "b", category: "booking" }]);
    const out = await get(p.sub, { category: "selling" });
    expect(out.rules).toHaveLength(2);
    expect(out.rules.every((r) => r.matches_requested_category === false)).toBe(true);
    expect(out.note).toMatch(/selling/);
    for (const c of ["scheduling", "messaging", "purchasing", "booking", "research", "admin", "other"]) expect(out.note).toContain(c);
  });

  it("matches the category ignoring case and surrounding spaces", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    const out = await get(p.sub, { category: "  Messaging " });
    expect(out.rules[0].matches_requested_category).toBe(true);
    expect(out.note).toBeDefined(); // a category was asked for, so the advisory note is present
  });

  it("with no category, every rule is returned in the usual order, and the flag is left out of every rule", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }, { text: "b", category: "booking", when: "a much longer and narrower condition than the other one" }]);
    const out = await get(p.sub);
    expect(out.rules.map((r) => r.text)).toEqual(["b", "a"]);
    for (const r of out.rules) expect("matches_requested_category" in r).toBe(false);
  });

  it("the note is present only when a category is asked for", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    expect("note" in (await get(p.sub))).toBe(false);
    expect("note" in (await get(p.sub, {}))).toBe(false);
    expect(typeof (await get(p.sub, { category: "messaging" })).note).toBe("string"); // a category of ours
    expect(typeof (await get(p.sub, { category: "selling" })).note).toBe("string"); // a category that is not ours
  });

  it("a blank category counts as no category: no note, no flag", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    for (const category of ["", "   "]) {
      const out = await get(p.sub, { category });
      expect("note" in out).toBe(false);
      expect("matches_requested_category" in out.rules[0]).toBe(false);
    }
  });

  it("the note says the rules are advice the person is relying on, says flagged rules are not the only ones that matter, and never implies enforcement or that rules are optional", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    const notes = [(await get(p.sub, { category: "messaging" })).note ?? "", (await get(p.sub, { category: "selling" })).note ?? ""];
    for (const note of notes) {
      expect(note).toMatch(/advice from the person/i);
      expect(note).toMatch(/the person is relying on you/i);
      expect(note).toMatch(/not the only|any of them might matter/i);
      // No word that suggests the rules are checked, forced, guaranteed, or something the agent may skip.
      expect(note).not.toMatch(/\b(must|required|mandatory|comply|compliance|violat\w*|guarantee\w*|enforce\w*|monitor\w*|checked|audited|penalt\w*)\b/i);
      expect(note).not.toMatch(/\b(optional|ignore|skip|disregard|feel free|up to you|if you like|if you want|you may choose)\b/i);
    }
    expect(notes[0]).toMatch(/best match/i); // a category of ours: the matching rules are the best match
    expect(notes[1]).toMatch(/no rule is marked as matching/i); // a category that is not ours
  });

  it("the rules version tag does not depend on the category argument", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    const a = await get(p.sub);
    expect((await get(p.sub, { category: "booking" })).rules_version).toBe(a.rules_version);
  });

  it("still never returns proposed or retired rules, another agent's rules, or another person's rules, whatever the category", async () => {
    const { p, svc, ids } = await withRules([{ text: "live", category: "messaging" }, { text: "to retire", category: "messaging" }]);
    await svc.retire(ids[1]);
    await svc.propose({ text: "only proposed", category: "messaging", when: "x", because: "b" });
    const made = await svc.propose({ text: "for another agent", category: "messaging", when: "x", because: "b", scope: `agent:${crypto.randomUUID()}` });
    if (made.ok) await svc.approve(made.rule.id);
    const stranger = await withRules([{ text: "belongs to someone else", category: "messaging" }]);
    for (const args of [{}, { category: "messaging" }, { category: "selling" }]) {
      expect((await get(p.sub, args)).rules.map((r) => r.text)).toEqual(["live"]);
    }
    expect((await get(stranger.p.sub)).rules.map((r) => r.text)).toEqual(["belongs to someone else"]);
  });

  it("keeps every existing field and records one agent read per call, with no categories", async () => {
    const { p } = await withRules([{ text: "a", category: "messaging" }]);
    const out = await get(p.sub, { category: "booking" });
    expect(Object.keys(out.rules[0]).sort()).toEqual(
      ["category", "conflicts_with", "id", "matches_requested_category", "precedence_rank", "scope", "text", "version"].sort(),
    );
    const rows = ((await p.t.auditLog.list()) as { action: string; categoriesRead: string[] }[]).filter((r) => r.action === "get_rules");
    expect(rows).toHaveLength(1);
    expect(rows[0].categoriesRead).toEqual([]);
  });

  it("leaves the tool's name, description and inputs exactly as they are, so the change works for agents that are already connected", async () => {
    const { p } = await withRules([]);
    const res = await asAgent(p.sub, listTools);
    const tool = (await readJson(res)).result.tools.find((t: { name: string }) => t.name === "get_rules");
    expect(tool.description).toBe(DESCRIPTION_TODAY);
    expect(Object.keys(tool.inputSchema.properties).sort()).toEqual(["category", "context"]);
  });
});

// ---- propose_correction through the real endpoint ------------------------------------------------------------------------
describe("propose_correction as an agent calls it", () => {
  const modelThatWritesFromTheNote = (): import("./claude").ModelClient => ({
    async complete(req) {
      if (req.system.includes("compare two rules")) return { text: "independent", inputTokens: 5, outputTokens: 1 };
      const note = /: ([^\n]*)\n<\/user_feedback>/.exec(req.user)?.[1] ?? "";
      return { text: JSON.stringify({ text: note, category: "scheduling", scope: "all", when: "the situation in the note", do: null, dont: null, strength: "prefer", because: note, confidence: 0.8, needs_more_info: false, question: null }), inputTokens: 100, outputTokens: 40 };
    },
  });
  const env = (): McpEnv => ({ ...checkOn(), services: makeServices(db, masters, modelThatWritesFromTheNote()) });
  const call = async (sub: string, args: unknown) => handleMcp(mcpRequest(toolCall("propose_correction", args), withBearer(await sign({ sub }))), env());

  it("a confirmed agent with the task permission gets a status back; the person gets a proposal, and nothing is active", async () => {
    const p = await person();
    await confirmed(p.sub, p.t);
    const res = await call(p.sub, { user_said: "No, not mornings before ten, those are for school drop off", category: "scheduling" });
    const payload = JSON.parse((await readJson(res)).result.content[0].text);
    expect(payload.proposal_status).toBe("queued");
    expect(Object.keys(payload).sort()).toEqual(["message", "proposal_status"]); // a status and a message, nothing about the person
    const rules = await rulesService(db, p.user.id).list();
    expect(rules.map((r) => r.status)).toEqual(["proposed"]);
    const body = await readJson(await asAgent(p.sub, toolCall("get_rules")));
    expect(JSON.parse(body.result.content[0].text).rules).toEqual([]); // no agent sees it until the person approves
    expect(((await p.t.auditLog.list()) as { action: string }[]).some((a) => a.action === "propose_correction")).toBe(true);
  });

  it("rejects input that does not fit the tool's schema, and an agent that is not yet confirmed is refused", async () => {
    const p = await person();
    const unconfirmed = await call(p.sub, { user_said: "No mornings please", category: "scheduling" });
    expect((await refusalOf(unconfirmed)).payload.error).toBe("not_confirmed");
    await confirmed(p.sub, p.t);
    const bad = await call(p.sub, { user_said: "x".repeat(600), category: "scheduling" });
    expect((await readJson(bad)).result?.isError === true || (await bad.clone().text()).includes("error")).toBe(true);
    expect(await rulesService(db, p.user.id).list()).toHaveLength(0);
  });
});

describe("Release 1: reject-reason log for the connection check (the project notes)", () => {
  let logged: unknown[][];
  beforeEach(() => {
    logged = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logged.push(a));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a));
  });
  afterEach(() => vi.restoreAllMocks());
  const rejectLines = () => logged.filter((a) => a[0] === "mcp-reject").map((a) => String(a[1]));
  const allOutput = () => logged.map((a) => a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")).join("\n");
  const shape = async (res: Response) => ({ status: res.status, www: res.headers.get("www-authenticate"), type: res.headers.get("content-type"), body: await res.text() });

  it("a removed connection: logs connection_revoked, and the 401 (header and body) is exactly as before", async () => {
    const p = await person();
    const conn = await confirmed(p.sub, p.t);
    await revokeConnection(p.t, conn.id);
    logged.length = 0;
    expect(await shape(await asAgent(p.sub, listTools))).toEqual({
      status: 401,
      www: 'Bearer error="invalid_token"',
      type: "application/json",
      body: '{"error":"unauthorized","message":"This agent was disconnected."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"connection_revoked"}']);
  });

  it("an unconfirmed connection past its window: logs not_confirmed_in_time, and the 403 is exactly as before", async () => {
    const p = await person();
    await toolNames(p.sub, "client-too-late");
    const conn = ((await p.t.agentConnections.list()) as Connection[]).find((c) => c.oauthClientId === "client-too-late")!;
    await p.t.agentConnections.update(conn.id, { expiresAt: new Date(Date.now() - 1000) });
    logged.length = 0;
    expect(await shape(await asAgent(p.sub, listTools, "client-too-late"))).toEqual({
      status: 403,
      www: null,
      type: "application/json",
      body: '{"error":"forbidden","message":"This agent was not confirmed in time. Remove it on the Agents screen and connect it again."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"not_confirmed_in_time"}']);
  });

  it("a sixth new agent is refused with a plain 403 and logs connection_cap_reached; nothing is created for it", async () => {
    const p = await person();
    for (let i = 0; i < 5; i++) await toolNames(p.sub, `client-cap-${i}`);
    logged.length = 0;
    expect(await shape(await asAgent(p.sub, listTools, "client-cap-over"))).toEqual({
      status: 403,
      www: null,
      type: "application/json",
      body: '{"error":"cap_reached","message":"You have reached the limit of 5 connected agents. Remove one on Connected Agents in Rare Tomato, then try again."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"connection_cap_reached"}']);
    expect((await p.t.agentConnections.list()).length).toBe(5);
  });

  it("a token with no client id: logs no_client_id, and the 403 is exactly as before", async () => {
    const p = await person();
    expect(await shape(await asAgent(p.sub, listTools, null))).toEqual({
      status: 403,
      www: null,
      type: "application/json",
      body: '{"error":"forbidden","message":"This sign-in does not say which agent it belongs to."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"no_client_id"}']);
  });

  it("an account that is not finished: logs account_setup_incomplete, and the 403 is exactly as before", async () => {
    const p = await person(false);
    expect(await shape(await asAgent(p.sub, listTools))).toEqual({
      status: 403,
      www: null,
      type: "application/json",
      body: '{"error":"forbidden","message":"Finish setting up your account on the Rare Tomato website first."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"account_setup_incomplete"}']);
  });

  it("one of our own tokens that is not valid: logs bearer_invalid, and the 401 is exactly as before", async () => {
    const p = await person();
    const { token } = await issueDemoToken(p.t);
    const [rt, prefix] = token.split("_");
    const bad = `${rt}_${prefix}_${"x".repeat(43)}`;
    logged.length = 0;
    expect(await shape(await handleMcp(mcpRequest(listTools, withBearer(bad)), checkOn()))).toEqual({
      status: 401,
      www: 'Bearer error="invalid_token"',
      type: "application/json",
      body: '{"error":"unauthorized","message":"This token is not valid."}',
    });
    expect(rejectLines()).toEqual(['{"reason":"bearer_invalid"}']);
    expect(allOutput()).not.toContain(bad);
  });

  it("logs hold no token, no fact value and no task detail (SEC-9), even while real facts and tasks are being read and written", async () => {
    const p = await person();
    await seed(p);
    const conn = await confirmed(p.sub, p.t, ["tasks:write", "profile:family", "profile:contacts"]);
    const SUMMARY = "UNIQUE-TASK-SUMMARY-7731";
    const DETAILS = "UNIQUE-TASK-DETAILS-7731";
    const token = await sign({ sub: p.sub, clientId: "opaque-client-code" });
    const call = (body: unknown) => handleMcp(mcpRequest(body, withBearer(token)), checkOn());
    expect((await call(toolCall("get_care_profile"))).status).toBe(200);
    expect((await call(toolCall("log_task", { external_id: "hyg-1", summary: SUMMARY, category: "admin", details: DETAILS }))).status).toBe(200);
    await revokeConnection(p.t, conn.id);
    expect((await call(listTools)).status).toBe(401);
    expect((await handleMcp(mcpRequest(listTools, withBearer("nope")), checkOn())).status).toBe(401);
    const text = allOutput();
    for (const secret of ["Casual with friends", "Priya", "Needs 15 minutes", SUMMARY, DETAILS, token, p.sub, "opaque-client-code"]) {
      expect(text).not.toContain(secret);
    }
    expect(rejectLines().sort()).toEqual([
      '{"reason":"connection_revoked"}',
      '{"reason":"malformed","shape":{"scheme":"bearer","len":"1-19","dots":0,"charset":"b64url"}}',
    ]);
    for (const line of rejectLines()) expect(Object.keys(JSON.parse(line))).toEqual(JSON.parse(line).reason === "malformed" ? ["reason", "shape"] : ["reason"]);
  });
});

describe("an error inside a tool never puts the person's text in the logs", () => {
  it("a failing read ends as the plain 'something went wrong' reply, and the label in the error's text is nowhere in the logs", async () => {
    const lines: string[] = [];
    const spies = (["log", "error", "warn"] as const).map((m) => vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void lines.push(a.map(String).join(" "))));
    try {
      const p = await person();
      const client = "https://claude.ai/oauth/client-metadata.json";
      await confirmed(p.sub, p.t, [], client, "claude");
      const real = makeServices(db, masters);
      const env: McpEnv = {
        ...checkOn(),
        services: {
          ...real,
          facts: async () => {
            throw new Error("Failed query: insert into profile_facts ... params: SECRET-LABEL-ZEBRA-4417 my-private-detail");
          },
        },
      };
      const res = await handleMcp(mcpRequest(toolCall("get_care_profile"), withBearer(await sign({ sub: p.sub, clientId: client }))), env);
      const text = await res.text();
      expect(text).not.toContain("ZEBRA");
      expect(text).toMatch(/Something went wrong/);
      expect(lines.join("\n")).not.toContain("ZEBRA");
      expect(lines.some((l) => l.startsWith("app-error"))).toBe(true);
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
  });
});
