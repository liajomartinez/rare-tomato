import { createMcpHandler, hostHeaderValidationResponse } from "@modelcontextprotocol/server";
import { acceptedAudiences, baseUrl, isKnownOrigin, baseFor, knownHosts, metadataUrlFor } from "./base-address";
import { resolveWithProductionDb, resolveBearerWithProductionDb, productionServices } from "@/db/production";
import { authenticate, logReject, unauthorized, type AuthConfig } from "./auth";
import type { BearerResult } from "./tokens";
import type { Resolved } from "./connections";
import { createMcpServer, type Access, type Caller, type Services, type ToolContext, type ToolDef } from "./mcp";

export interface McpEnv {
  allowedHosts: string[];
  auth: AuthConfig;
  /** Tests can swap in their own tool list. */
  tools?: ToolDef[];
  /** What the tools read from. Without it, tools that act for a person are not offered. */
  services?: Services;
  /**
   * When set, an OAuth caller must map to a person and an active connection (spec FR-A2 to FR-A4).
   * Off by default, so the live endpoint is unchanged until CONNECTIONS_ENFORCED=true is set.
   */
  resolveConnection?: (input: { authSubject: string; clientId: string; email?: string }) => Promise<Resolved>;
  /** Checks one of our own bearer tokens against its stored hash. Without it, bearer tokens are refused. */
  resolveBearer?: (token: string) => Promise<BearerResult>;
}

export { resourceUrl } from "./base-address";

/** Where our protected resource metadata (RFC 9728) lives for the MCP endpoint, on the main address or on a given one. */
export function metadataUrl(base: string = baseUrl()): string {
  return metadataUrlFor(base);
}

export function authkitIssuer(): string | undefined {
  const raw = process.env.AUTHKIT_DOMAIN?.trim();
  if (!raw) return undefined;
  return (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/+$/, "");
}

function json(status: number, error: string, message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error, message }), { status, headers: { "content-type": "application/json", ...headers } });
}

export function envFromProcess(): McpEnv {
  const issuer = authkitIssuer();
  const enforced = process.env.CONNECTIONS_ENFORCED === "true";
  return {
    services: enforced || process.env.BEARER_ENABLED === "true" ? productionServices() : undefined,
    resolveConnection: enforced ? resolveWithProductionDb : undefined,
    resolveBearer: process.env.BEARER_ENABLED === "true" || enforced ? resolveBearerWithProductionDb : undefined,
    // The main address and the old alias are always allowed, on top of anything listed in MCP_ALLOWED_HOSTS.
    allowedHosts: [
      ...new Set([
        ...(process.env.MCP_ALLOWED_HOSTS ?? "localhost,127.0.0.1")
          .split(",")
          .map((h) => h.trim())
          .filter(Boolean),
        ...knownHosts(),
      ]),
    ],
    auth: {
      oauth: issuer ? { issuer, audience: acceptedAudiences() } : undefined,
      resourceMetadataUrl: issuer ? metadataUrl() : undefined,
    },
  };
}

// Stateless: the SDK builds a fresh server for every request and keeps no session. What it offers depends on
// who is calling THIS request, so an unassigned agent is only offered the status tool.
const mcp = createMcpHandler((ctx) => {
  const extra = ctx.authInfo?.extra as { caller?: Caller; services?: Services; tools?: ToolDef[] } | undefined;
  const access: Access = extra?.caller ? { mode: "checked", caller: extra.caller } : { mode: "unchecked" };
  const toolCtx: ToolContext = { caller: extra?.caller, services: extra?.services };
  return createMcpServer(access, toolCtx, extra?.tools);
});

export async function handleMcp(request: Request, env: McpEnv): Promise<Response> {
  // On one of our own addresses, the 401 challenge points at the metadata on THAT address, so a client that connected through the old alias is told
  // the old alias's metadata (and one that connected through the main address, the main address's).
  const auth = env.auth.resourceMetadataUrl && isKnownOrigin(request.url) ? { ...env.auth, resourceMetadataUrl: metadataUrlFor(baseFor(request.url)) } : env.auth;
  const who = await authenticate(request, auth);
  if (who instanceof Response) return who;

  // Guard against DNS rebinding: only answer for hostnames we expect. Checked before a connection is looked up, so a request
  // for a wrong hostname never creates or touches a connection.
  const badHost = hostHeaderValidationResponse(
    request,
    env.allowedHosts.map((h) => h.split(":")[0]),
  );
  if (badHost) {
    logReject("host_not_allowed");
    return badHost;
  }

  let caller: Caller | undefined;

  if (who.kind === "bearer") {
    if (!env.resolveBearer) {
      logReject("bearer_not_enabled");
      return unauthorized(auth.resourceMetadataUrl);
    }
    const r = await env.resolveBearer(who.token);
    if (!r.ok) {
      logReject("bearer_invalid");
      return json(401, "unauthorized", "This token is not valid.", { "www-authenticate": 'Bearer error="invalid_token"' });
    }
    caller = r.caller;
  } else if (env.resolveConnection) {
    if (!who.clientId) {
      logReject("no_client_id");
      return json(403, "forbidden", "This sign-in does not say which agent it belongs to.");
    }
    const r = await env.resolveConnection({ authSubject: who.subject, clientId: who.clientId, email: who.email });
    if (!r.ok) {
      logReject(
        r.reason === "revoked" ? "connection_revoked" : r.reason === "account_setup_incomplete" ? "account_setup_incomplete" : r.reason === "cap_reached" ? "connection_cap_reached" : "not_confirmed_in_time",
      );
      if (r.reason === "cap_reached") return json(403, "cap_reached", "You have reached the limit of 5 connected agents. Remove one on Connected Agents in Rare Tomato, then try again.");
      if (r.reason === "revoked") return json(401, "unauthorized", "This agent was disconnected.", { "www-authenticate": 'Bearer error="invalid_token"' });
      if (r.reason === "account_setup_incomplete") return json(403, "forbidden", "Finish setting up your account on the Rare Tomato website first.");
      return json(403, "forbidden", "This agent was not confirmed in time. Remove it on the Agents screen and connect it again.");
    }
    caller = { userId: r.user.id, connectionId: r.connection.id, scopes: r.scopes, confirmed: !r.unassigned };
  }

  return mcp.fetch(request, {
    authInfo: {
      token: "redacted",
      clientId: who.kind === "oauth" ? (who.clientId ?? "") : "bearer",
      scopes: caller?.scopes ?? [],
      extra: { caller, services: env.services, tools: env.tools },
    },
  });
}
