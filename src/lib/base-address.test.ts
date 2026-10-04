import fs from "node:fs";
import path from "node:path";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { afterEach, describe, expect, it } from "vitest";
import { GET as metadataMcp } from "@/app/.well-known/oauth-protected-resource/mcp/route";
import { GET as metadataRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { acceptedAudiences, baseFor, baseUrl, DEFAULT_BASE_URL, knownHosts, LEGACY_BASE_URL, redirectUris, resourceUrl } from "./base-address";
import { handleMcp } from "./handler";

// The site's address lives in one place (src/lib/base-address.ts). raretomato.ai is the main address; agent-care.vercel.app stays as an alias, so
// agents connected through the old address keep working.

const saved = { base: process.env.APP_BASE_URL, resource: process.env.MCP_RESOURCE_URL, issuer: process.env.AUTHKIT_DOMAIN };
afterEach(() => {
  for (const [k, v] of [["APP_BASE_URL", saved.base], ["MCP_RESOURCE_URL", saved.resource], ["AUTHKIT_DOMAIN", saved.issuer]] as const) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("the base address setting", () => {
  it("defaults to raretomato.ai, with the old address as an alias", () => {
    delete process.env.APP_BASE_URL;
    delete process.env.MCP_RESOURCE_URL;
    expect(DEFAULT_BASE_URL).toBe("https://raretomato.ai");
    expect(LEGACY_BASE_URL).toBe("https://agent-care.vercel.app");
    expect(baseUrl()).toBe("https://raretomato.ai");
    expect(resourceUrl()).toBe("https://raretomato.ai/mcp");
    expect(acceptedAudiences()).toEqual(["https://raretomato.ai/mcp", "https://agent-care.vercel.app/mcp"]);
    expect(knownHosts()).toEqual(["raretomato.ai", "agent-care.vercel.app"]);
  });

  it("is one setting: APP_BASE_URL moves everything that follows it", () => {
    process.env.APP_BASE_URL = "https://example.test/";
    delete process.env.MCP_RESOURCE_URL;
    expect(baseUrl()).toBe("https://example.test");
    expect(resourceUrl()).toBe("https://example.test/mcp");
    expect(acceptedAudiences()).toContain("https://agent-care.vercel.app/mcp");
    expect(redirectUris()).toEqual(["https://example.test/callback", "https://agent-care.vercel.app/callback"]);
  });

  it("the return addresses the sign-in provider must allow are exactly these two", () => {
    delete process.env.APP_BASE_URL;
    expect(redirectUris()).toEqual(["https://raretomato.ai/callback", "https://agent-care.vercel.app/callback"]);
  });

  it("echoes the address a request came in on, only if it is one of ours", () => {
    delete process.env.APP_BASE_URL;
    expect(baseFor("https://agent-care.vercel.app/mcp")).toBe("https://agent-care.vercel.app");
    expect(baseFor("https://raretomato.ai/x")).toBe("https://raretomato.ai");
    expect(baseFor("https://evil.example/mcp")).toBe("https://raretomato.ai");
    expect(baseFor("not a url")).toBe("https://raretomato.ai");
  });
});

describe("the protected-resource metadata", () => {
  it("names the agent address the client came in on, so old and new connections both see matching metadata", async () => {
    process.env.AUTHKIT_DOMAIN = "https://example.authkit.app";
    delete process.env.APP_BASE_URL;
    for (const handler of [metadataMcp, metadataRoot]) {
      const onNew = await (handler(new Request("https://raretomato.ai/.well-known/oauth-protected-resource/mcp")) as Response).json();
      const onOld = await (handler(new Request("https://agent-care.vercel.app/.well-known/oauth-protected-resource/mcp")) as Response).json();
      const onOther = await (handler(new Request("https://evil.example/.well-known/oauth-protected-resource/mcp")) as Response).json();
      expect(onNew.resource).toBe("https://raretomato.ai/mcp");
      expect(onOld.resource).toBe("https://agent-care.vercel.app/mcp");
      expect(onOther.resource).toBe("https://raretomato.ai/mcp");
    }
  });
});

describe("the agent endpoint accepts a token for either address", () => {
  const ISSUER = "https://example.authkit.app";
  it("accepts both audiences, refuses any other, and the challenge names the metadata of the address used", async () => {
    delete process.env.APP_BASE_URL;
    delete process.env.MCP_RESOURCE_URL;
    const keys = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(keys.publicKey)), kid: "k", alg: "RS256", use: "sig" };
    const sign = (aud: string) => new SignJWT({ sub: "user_1", client_id: "opaque" }).setProtectedHeader({ alg: "RS256", kid: "k" }).setIssuer(ISSUER).setAudience(aud).setIssuedAt().setExpirationTime("5m").sign(keys.privateKey);
    const env = {
      allowedHosts: ["localhost", ...knownHosts()],
      auth: { oauth: { issuer: ISSUER, audience: acceptedAudiences(), keys: createLocalJWKSet({ keys: [jwk] }) }, resourceMetadataUrl: "https://raretomato.ai/.well-known/oauth-protected-resource/mcp" },
    };
    const call = (url: string, token?: string) =>
      handleMcp(
        new Request(url, {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: new URL(url).host, ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
        }),
        env,
      );
    expect((await call("https://raretomato.ai/mcp", await sign("https://raretomato.ai/mcp"))).status).toBe(200);
    expect((await call("https://agent-care.vercel.app/mcp", await sign("https://agent-care.vercel.app/mcp"))).status).toBe(200);
    expect((await call("https://raretomato.ai/mcp", await sign("https://agent-care.vercel.app/mcp"))).status).toBe(200); // either token on either address
    expect((await call("https://raretomato.ai/mcp", await sign("https://evil.example/mcp"))).status).toBe(401);
    const oldChallenge = (await call("https://agent-care.vercel.app/mcp")).headers.get("www-authenticate") ?? "";
    const newChallenge = (await call("https://raretomato.ai/mcp")).headers.get("www-authenticate") ?? "";
    expect(oldChallenge).toContain("https://agent-care.vercel.app/.well-known/oauth-protected-resource/mcp");
    expect(newChallenge).toContain("https://raretomato.ai/.well-known/oauth-protected-resource/mcp");
  });
});

describe("the contact address", () => {
  const root = process.cwd();
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) return walk(p);
      return /\.(tsx?|md)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
    });
  const shown = [...walk(path.join(root, "src/app")), path.join(root, "src/lib/strings.ts"), path.join(root, "src/lib/agent-guides.ts"), path.join(root, "src/lib/blocked-data.ts"), path.join(root, "README.md"), ...walk(path.join(root, "docs/guides"))];

  it("every page, shared string and user-facing document shows only support@raretomato.ai as an email address", () => {
    const found = shown.flatMap((f) =>
      [...fs.readFileSync(f, "utf8").matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map((m) => `${path.relative(root, f)}: ${m[0]}`),
    );
    expect(found.length).toBeGreaterThan(3);
    expect(found.filter((x) => !x.endsWith(": support@raretomato.ai"))).toEqual([]);
  });

  it("the Privacy Notice and the Terms both show it", () => {
    for (const f of ["src/app/privacy/page.tsx", "src/app/terms/page.tsx", "src/lib/strings.ts"]) expect(fs.readFileSync(path.join(root, f), "utf8")).toContain("support@raretomato.ai");
  });
});
