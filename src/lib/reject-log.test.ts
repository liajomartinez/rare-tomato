import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignJWT, createLocalJWKSet, errors, exportJWK, generateKeyPair, type JWTVerifyGetKey } from "jose";
import { handleMcp, type McpEnv } from "./handler";

// Release 1 of the reject-reason log (the project notes): one runtime-log line per rejected request,
// the reason class only, and NO change to any status, header or body. These tests pin both halves.

const ISSUER = "https://example.authkit.app";
const AUDIENCE = "https://agent-care.vercel.app/mcp";
const METADATA_URL = "https://agent-care.vercel.app/.well-known/oauth-protected-resource/mcp";

const good = await generateKeyPair("RS256");
const other = await generateKeyPair("RS256");
const goodJwk = { ...(await exportJWK(good.publicKey)), kid: "good", alg: "RS256", use: "sig" };

const env = (keys?: JWTVerifyGetKey): McpEnv => ({
  allowedHosts: ["localhost"],
  auth: { oauth: { issuer: ISSUER, audience: AUDIENCE, keys: keys ?? createLocalJWKSet({ keys: [goodJwk] }) }, resourceMetadataUrl: METADATA_URL },
});

function sign(
  opts: { key?: CryptoKey; kid?: string; issuer?: string; audience?: string; exp?: number | string; nbf?: string; sub?: string | null } = {},
) {
  const jwt = new SignJWT({ client_id: "opaque-client-code" })
    .setProtectedHeader({ alg: "RS256", kid: opts.kid ?? "good" })
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience(opts.audience ?? AUDIENCE)
    .setIssuedAt(typeof opts.exp === "number" ? opts.exp - 3600 : undefined)
    .setExpirationTime(opts.exp ?? "5m");
  if (opts.sub !== null) jwt.setSubject(opts.sub ?? "user_secret_subject_1");
  if (opts.nbf) jwt.setNotBefore(opts.nbf);
  return jwt.sign(opts.key ?? good.privateKey);
}

const listTools = { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} };
const request = (headers: Record<string, string> = {}) =>
  new Request("http://localhost:3000/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "localhost:3000", ...headers },
    body: JSON.stringify(listTools),
  });
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// What a rejected request looks like TODAY. These literals were recorded from the code before Release 1 was written.
const TODAY_401_HEADER = `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${METADATA_URL}"`;
const TODAY_401_BODY = '{"error":"unauthorized","message":"A valid bearer token is required."}';

async function snapshot(res: Response) {
  return { status: res.status, wwwAuthenticate: res.headers.get("www-authenticate"), contentType: res.headers.get("content-type"), body: await res.text() };
}
const TODAY_401 = { status: 401, wwwAuthenticate: TODAY_401_HEADER, contentType: "application/json", body: TODAY_401_BODY };

// What the host-header check answered before this change (recorded by running the code first).
const HOST_REFUSED_STATUS = 403;

let logged: unknown[][];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logged.push(a));
  vi.spyOn(console, "info").mockImplementation((...a: unknown[]) => void logged.push(a));
  vi.spyOn(console, "warn").mockImplementation((...a: unknown[]) => void logged.push(a));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a));
});
afterEach(() => vi.restoreAllMocks());

const rejectLines = () => logged.filter((a) => a[0] === "mcp-reject").map((a) => String(a[1]));
const allOutput = () => logged.map((a) => a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")).join("\n");

/** Every rejected-token case, each with the reason class it must log. */
const nowSeconds = Math.floor(Date.now() / 1000);
const cases: { name: string; make: () => Promise<{ headers: Record<string, string>; keys?: JWTVerifyGetKey; noOauth?: boolean }>; reason: string }[] = [
  { name: "no Authorization header", make: async () => ({ headers: {} }), reason: "no_token" },
  { name: "a header that is not Bearer", make: async () => ({ headers: { authorization: "Basic dXNlcjpwYXNz" } }), reason: "not_bearer" },
  { name: "an expired token", make: async () => ({ headers: bearer(await sign({ exp: nowSeconds - 120 })) }), reason: "expired" },
  { name: "a token for another audience", make: async () => ({ headers: bearer(await sign({ audience: "https://elsewhere.example/mcp" })) }), reason: "wrong_audience" },
  { name: "a token from another issuer", make: async () => ({ headers: bearer(await sign({ issuer: "https://other.authkit.app" })) }), reason: "wrong_issuer" },
  { name: "a token signed with another key", make: async () => ({ headers: bearer(await sign({ key: other.privateKey })) }), reason: "bad_signature" },
  { name: "a token whose key id is unknown", make: async () => ({ headers: bearer(await sign({ kid: "nobody" })) }), reason: "bad_signature" },
  { name: "a malformed token", make: async () => ({ headers: bearer("nope") }), reason: "malformed" },
  { name: "a token with no subject", make: async () => ({ headers: bearer(await sign({ sub: null })) }), reason: "no_subject" },
  { name: "a token that is not valid yet (a claim failure we do not name)", make: async () => ({ headers: bearer(await sign({ nbf: "2h" })) }), reason: "unclassified" },
  { name: "OAuth not configured on the server", make: async () => ({ headers: bearer(await sign()), noOauth: true }), reason: "oauth_not_configured" },
  { name: "signing keys that time out", make: async () => ({ headers: bearer(await sign()), keys: async () => { throw new errors.JWKSTimeout(); } }), reason: "keys_unavailable" },
  { name: "signing keys: a plain network error", make: async () => ({ headers: bearer(await sign()), keys: async () => { throw new TypeError("fetch failed"); } }), reason: "keys_unavailable" },
  { name: "signing keys: a generic bad response", make: async () => ({ headers: bearer(await sign()), keys: async () => { throw new errors.JOSEError("Expected 200 OK from the JSON Web Key Set HTTP response"); } }), reason: "keys_unavailable" },
  { name: "signing keys that report no matching key", make: async () => ({ headers: bearer(await sign()), keys: async () => { throw new errors.JWKSNoMatchingKey(); } }), reason: "bad_signature" },
];

async function run(c: (typeof cases)[number]) {
  const made = await c.make();
  const e = made.noOauth ? ({ allowedHosts: ["localhost"], auth: { resourceMetadataUrl: METADATA_URL } } satisfies McpEnv) : env(made.keys);
  return handleMcp(request(made.headers), e);
}

describe("Release 1: responses are unchanged (the regression pin)", () => {
  for (const c of cases) {
    it(`still answers ${c.name} with today's exact 401 (status, header and body)`, async () => {
      expect(await snapshot(await run(c))).toEqual(TODAY_401);
    });
  }

  it("still answers a valid token with a normal 200", async () => {
    const res = await handleMcp(request(bearer(await sign())), env());
    expect(res.status).toBe(200);
  });
});

describe("Release 1: the reject-reason log", () => {
  for (const c of cases) {
    it(`logs exactly one line, reason "${c.reason}", for ${c.name}`, async () => {
      await run(c);
      expect(rejectLines()).toHaveLength(1);
      const line = JSON.parse(rejectLines()[0]);
      expect(line.reason).toBe(c.reason);
      // Header-level and token-check reasons carry the header's shape; "oauth_not_configured" and "no_subject" (after the token verified) are logged without it.
      // A wrong_audience line also carries the token's aud and the time (see the audience tests below).
      const keys = ["oauth_not_configured", "no_subject"].includes(c.reason) ? ["reason"] : c.reason === "wrong_audience" ? ["reason", "shape", "aud", "at"] : ["reason", "shape"];
      expect(Object.keys(line)).toEqual(keys);
    });
  }

  it("writes no reject line for a valid token", async () => {
    await handleMcp(request(bearer(await sign())), env());
    expect(rejectLines()).toEqual([]);
  });

  it("logs only the reason: no token, subject, issuer, audience or message (SEC-9)", async () => {
    const token = await sign();
    const expired = await sign({ exp: nowSeconds - 120 });
    const wrongAudience = await sign({ audience: "https://elsewhere.example/mcp" });
    for (const t of [expired, wrongAudience, "nope"]) await handleMcp(request(bearer(t)), env());
    await handleMcp(request(bearer(token)), env()); // a valid call in between
    const text = allOutput();
    for (const secret of [token, expired, wrongAudience, "user_secret_subject_1", "opaque-client-code", "example.authkit.app", "agent-care.vercel.app"]) {
      expect(text).not.toContain(secret);
    }
    for (const line of rejectLines()) {
      const keys = Object.keys(JSON.parse(line));
      expect(keys).toEqual(JSON.parse(line).reason === "wrong_audience" ? ["reason", "shape", "aud", "at"] : ["reason", "shape"]);
    }
    expect(rejectLines()).toHaveLength(3);
  });

  it("for a wrong audience, logs the aud value and the time, and never the token", async () => {
    const wrongAudience = await sign({ audience: "https://elsewhere.example/mcp" });
    await handleMcp(request(bearer(wrongAudience)), env());
    const line = JSON.parse(rejectLines()[0]);
    expect(line.reason).toBe("wrong_audience");
    expect(line.aud).toEqual(["https://elsewhere.example/mcp"]);
    expect(Number.isNaN(Date.parse(line.at))).toBe(false);
    const [header, payload, signature] = wrongAudience.split(".");
    const text = allOutput();
    for (const part of [wrongAudience, header, payload, signature, "user_secret_subject_1", "opaque-client-code", "example.authkit.app"]) expect(text).not.toContain(part);
  });

  it("logs no aud for any other reason, and keeps a long or odd aud short", async () => {
    await handleMcp(request(bearer(await sign({ exp: nowSeconds - 120 }))), env());
    expect(JSON.parse(rejectLines()[0])).not.toHaveProperty("aud");
    logged = [];
    await handleMcp(request(bearer(await sign({ audience: "https://x.example/" + "a".repeat(500) }))), env());
    expect(JSON.parse(rejectLines()[0]).aud[0].length).toBe(200);
  });

  it("writes the header's shape, and only the shape", async () => {
    const shapeOf = async (headers: Record<string, string>) => {
      logged.length = 0;
      await handleMcp(request(headers), env());
      return JSON.parse(rejectLines()[0]).shape;
    };
    expect(await shapeOf({})).toEqual({ scheme: "none", len: "0", dots: 0, charset: "b64url" });
    expect(await shapeOf({ authorization: "Basic dXNlcjpwYXNz" })).toEqual({ scheme: "other", len: "0", dots: 0, charset: "b64url" });
    expect(allOutput()).not.toContain("dXNlcjpwYXNz");
    expect(await shapeOf(bearer("nope"))).toEqual({ scheme: "bearer", len: "1-19", dots: 0, charset: "b64url" });
    expect(await shapeOf(bearer("a.b.c"))).toEqual({ scheme: "bearer", len: "1-19", dots: 2, charset: "b64url" });
    expect(await shapeOf(bearer("x".repeat(150)))).toEqual({ scheme: "bearer", len: "100-499", dots: 0, charset: "b64url" });
    expect(await shapeOf(bearer("x".repeat(2500)))).toEqual({ scheme: "bearer", len: "2000+", dots: 0, charset: "b64url" });
    expect(await shapeOf(bearer("a.b.c.d.e.f.g.h"))).toEqual({ scheme: "bearer", len: "1-19", dots: 5, charset: "b64url" });
    expect(await shapeOf(bearer("has space+and/chars"))).toEqual({ scheme: "bearer", len: "1-19", dots: 0, charset: "other" });
    expect(allOutput()).not.toContain("has space");
  });

  it("a real signed token that fails a check logs only its shape (a distinctive token string never appears)", async () => {
    const t = await sign({ exp: nowSeconds - 120 });
    await handleMcp(request(bearer(t)), env());
    const shape = JSON.parse(rejectLines()[0]).shape;
    expect(shape.scheme).toBe("bearer");
    expect(shape.dots).toBe(2);
    expect(shape.charset).toBe("b64url");
    expect(allOutput()).not.toContain(t);
    for (const part of t.split(".")) expect(allOutput()).not.toContain(part);
  });

  it("a bearer-style token while bearer checking is off logs bearer_not_enabled, and the response is today's 401", async () => {
    const res = await handleMcp(request(bearer("rt_some_demo_token_value")), env());
    expect(await snapshot(res)).toEqual(TODAY_401);
    expect(rejectLines()).toEqual(['{"reason":"bearer_not_enabled"}']);
    expect(allOutput()).not.toContain("rt_some_demo_token_value");
  });

  it("a request for a host we do not answer for logs host_not_allowed, and the response is unchanged", async () => {
    const good = await sign();
    const wrongHost = () => handleMcp(request({ ...bearer(good), host: "evil.example" }), env());
    const before = await snapshot(await wrongHost());
    logged.length = 0;
    const after = await snapshot(await wrongHost());
    expect(after).toEqual(before);
    expect(after.status).toBe(HOST_REFUSED_STATUS);
    expect(rejectLines()).toEqual(['{"reason":"host_not_allowed"}']);
    expect(allOutput()).not.toContain(good);
    expect(allOutput()).not.toContain("evil.example");
  });

  it("a failing log call can never change the response", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("the log is broken");
    });
    for (const c of cases) expect(await snapshot(await run(c))).toEqual(TODAY_401);
  });
});
