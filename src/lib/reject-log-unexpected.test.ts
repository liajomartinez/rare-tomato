import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test 3b of the project notes: an unexpected error while checking a token (a bug of ours, an unknown
// jose error code, something thrown that is not even an Error) is logged as "unclassified", and the response is today's 401.

const verifier = vi.hoisted(() => ({ fail: null as null | (() => never) }));
vi.mock("jose", async (importOriginal) => {
  const real = await importOriginal<typeof import("jose")>();
  return { ...real, jwtVerify: (...args: Parameters<typeof real.jwtVerify>) => (verifier.fail ? verifier.fail() : real.jwtVerify(...args)) };
});

import { createLocalJWKSet } from "jose";
import { authenticate } from "./auth";

const METADATA_URL = "https://agent-care.vercel.app/.well-known/oauth-protected-resource/mcp";
const config = { oauth: { issuer: "https://example.authkit.app", audience: "https://agent-care.vercel.app/mcp", keys: createLocalJWKSet({ keys: [] }) }, resourceMetadataUrl: METADATA_URL };
const req = () => new Request("http://localhost:3000/mcp", { method: "POST", headers: { authorization: "Bearer some-token-value-123" } });

// The request above carries "Bearer some-token-value-123": 20 characters, no dots, base64url characters only.
const SHAPED = (reason: string) => JSON.stringify({ reason, shape: { scheme: "bearer", len: "20-99", dots: 0, charset: "b64url" } });

let logged: unknown[][];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void logged.push(a));
  vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void logged.push(a));
});
afterEach(() => {
  verifier.fail = null;
  vi.restoreAllMocks();
});

const rejectLines = () => logged.filter((a) => a[0] === "mcp-reject").map((a) => String(a[1]));
const allOutput = () => logged.map((a) => a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")).join("\n");

async function expectToday401(res: unknown) {
  const r = res as Response;
  expect(r.status).toBe(401);
  expect(r.headers.get("www-authenticate")).toBe(`Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${METADATA_URL}"`);
  expect(await r.text()).toBe('{"error":"unauthorized","message":"A valid bearer token is required."}');
}

describe("an unexpected error is logged as unclassified", () => {
  it("a bug of ours (a plain Error) logs exactly {reason: unclassified}, never the message, and the response is today's 401", async () => {
    verifier.fail = () => {
      throw new Error("boom: internal detail");
    };
    await expectToday401(await authenticate(req(), config));
    expect(rejectLines()).toEqual([SHAPED("unclassified")]);
    expect(allOutput()).not.toContain("boom");
    expect(allOutput()).not.toContain("internal detail");
    expect(allOutput()).not.toContain("some-token-value-123");
  });

  it("an error with an unknown jose code logs unclassified, not keys_unavailable", async () => {
    verifier.fail = () => {
      throw Object.assign(new Error("new kind of failure"), { code: "ERR_SOMETHING_NEW" });
    };
    await expectToday401(await authenticate(req(), config));
    expect(rejectLines()).toEqual([SHAPED("unclassified")]);
  });

  it("something thrown that is not an Error (a string, null) logs unclassified and does not crash", async () => {
    for (const thrown of ["a string", null, undefined, 42]) {
      logged.length = 0;
      verifier.fail = () => {
        throw thrown;
      };
      await expectToday401(await authenticate(req(), config));
      expect(rejectLines()).toEqual([SHAPED("unclassified")]);
    }
  });

  it("a plain Error from the verifier is never classed as a key-fetch failure", async () => {
    verifier.fail = () => {
      throw new TypeError("fetch failed");
    };
    await authenticate(req(), config);
    expect(rejectLines()).not.toContain(SHAPED("keys_unavailable"));
  });
});
