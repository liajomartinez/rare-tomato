import { createHash } from "node:crypto";
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTVerifyGetKey } from "jose";

// Two ways in, as the spec describes (section 7.2):
//   Path A: our own bearer token ("rt_..."), for the demo agent and local testing only. Checked against a hash.
//   Path B: an OAuth access token (a signed JWT) issued by the managed authorization server (WorkOS AuthKit).
// Neither path passes tokens through to other services.

export interface OAuthConfig {
  /** Full issuer URL, e.g. https://example.authkit.app (no trailing slash). */
  issuer: string;
  /** Our MCP endpoint URL (or URLs: the main address and the old alias). A token must be issued for one of these exactly. */
  audience: string | string[];
  /** Test hook: a key resolver to use instead of the issuer's published keys. */
  keys?: JWTVerifyGetKey;
}

export interface AuthConfig {
  oauth?: OAuthConfig;
  /** URL of our protected resource metadata document (RFC 9728), sent in 401 responses. */
  resourceMetadataUrl?: string;
}

const keySets = new Map<string, JWTVerifyGetKey>();
function remoteKeys(issuer: string): JWTVerifyGetKey {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/oauth2/jwks`));
    keySets.set(issuer, keys);
  }
  return keys;
}

/**
 * Temporary diagnostic (off by default): logs which claim NAMES a sign-in token carries and the shape
 * of the client identifier, never any values except the public host of a URL-style client id.
 */
function logClaimShape(payload: Record<string, unknown>, clientId: string | undefined) {
  let shape = "missing";
  if (clientId) {
    try {
      shape = /^https?:\/\//.test(clientId) ? `url:${new URL(clientId).host}` : `opaque:${clientId.length}chars`;
    } catch {
      shape = "opaque";
    }
  }
  // A short fingerprint (not the value) shows whether different agents send different client ids,
  // and whether the id is simply our own WorkOS application's id.
  const fingerprint = clientId ? createHash("sha256").update(clientId).digest("hex").slice(0, 10) : null;
  const isOurApp = clientId ? clientId === process.env.WORKOS_CLIENT_ID : null;
  const scope = typeof payload.scope === "string" ? payload.scope : null;
  console.log("oauth-claims", JSON.stringify({ names: Object.keys(payload).sort(), clientId: shape, fingerprint, isOurApp, scope }));
}

/** Why a request to /mcp was rejected. A fixed list of classes: nothing else is ever logged about a rejection. */
export type RejectReason =
  | "no_token" | "not_bearer" | "expired" | "wrong_audience" | "wrong_issuer" | "bad_signature"
  | "malformed" | "no_subject" | "keys_unavailable" | "unclassified" | "oauth_not_configured"
  // from the connection check in handler.ts
  | "connection_revoked" | "not_confirmed_in_time" | "no_client_id" | "account_setup_incomplete" | "bearer_invalid" | "connection_cap_reached"
  // log-only: refusals that were not logged before (the response for each is unchanged)
  | "bearer_not_enabled" | "host_not_allowed";

/** Shape of the Authorization header: fixed classes and a length bucket, never any content (SEC-9). */
export function headerShape(header: string | null) {
  const m = /^(\S+)(?: (.*))?$/.exec(header ?? "");
  const scheme = !header ? "none" : m?.[1] === "Bearer" ? "bearer" : "other";
  const token = scheme === "bearer" ? (m?.[2] ?? "") : "";
  const n = token.length;
  const len = n === 0 ? "0" : n < 20 ? "1-19" : n < 100 ? "20-99" : n < 500 ? "100-499" : n < 1000 ? "500-999" : n < 2000 ? "1000-1999" : "2000+";
  const dots = Math.min((token.match(/\./g) ?? []).length, 5);
  const charset = /^[A-Za-z0-9._-]*$/.test(token) ? "b64url" : "other";
  return { scheme, len, dots, charset };
}

/**
 * One line to the runtime log, the reason class only: never the token, a claim, an id or any user data (SEC-9).
 * With the Authorization header given, the line also carries its shape (scheme class, length bucket, dot count, character set).
 * It must never change what the caller gets back, so a failing log call is swallowed.
 */
export function logReject(reason: RejectReason, header?: string | null, audience?: string[]) {
  try {
    const line = header === undefined ? { reason } : { reason, shape: headerShape(header) };
    // Only for wrong_audience: the token's `aud` value (a public address, not a secret) and the time, to diagnose which address an agent used.
    console.log("mcp-reject", JSON.stringify(audience ? { ...line, aud: audience, at: new Date().toISOString() } : line));
  } catch {
    // logging must never change the response
  }
}

/**
 * The `aud` claim of a token, read WITHOUT verifying it (only used after the token already failed on its audience, so the signature was good).
 * Returns just the audience strings, each cut to 200 characters; never the token, the other claims or the signature.
 */
function audienceOf(token: string): string[] | undefined {
  try {
    const aud = decodeJwt(token).aud;
    const list = (Array.isArray(aud) ? aud : aud === undefined ? [] : [aud]).filter((a): a is string => typeof a === "string");
    return list.slice(0, 5).map((a) => a.slice(0, 200));
  } catch {
    return undefined;
  }
}

/** Marks a failure to FETCH the signing keys (a timeout, a bad key-set response, a network error). */
class KeyFetchFailed extends Error {}

/** Wraps the key resolver so a real key-fetch failure is tagged where it happens, not guessed from the error afterwards. */
function tagKeyFetchFailures(getKey: JWTVerifyGetKey): JWTVerifyGetKey {
  return async (header, token) => {
    try {
      return await getKey(header, token);
    } catch (e) {
      const code = (e as { code?: string } | null)?.code;
      // No matching key means a bad token, not an outage: let it be classed bad_signature.
      if (code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS") throw e;
      throw new KeyFetchFailed();
    }
  };
}

function classify(e: unknown): RejectReason {
  if (e instanceof KeyFetchFailed) return "keys_unavailable";
  if (typeof e !== "object" || e === null) return "unclassified";
  const { code, claim } = e as { code?: string; claim?: string };
  if (code === "ERR_JWT_EXPIRED") return "expired";
  if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") return claim === "aud" ? "wrong_audience" : claim === "iss" ? "wrong_issuer" : "unclassified";
  if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED" || code === "ERR_JWKS_NO_MATCHING_KEY" || code === "ERR_JWKS_MULTIPLE_MATCHING_KEYS") return "bad_signature";
  if (code === "ERR_JWS_INVALID" || code === "ERR_JWT_INVALID" || code === "ERR_JOSE_NOT_SUPPORTED" || code === "ERR_JOSE_ALG_NOT_ALLOWED") return "malformed";
  // Anything else, including a bug in our own code, is unclassified. Only the class is logged, never the message.
  return "unclassified";
}

export function unauthorized(resourceMetadataUrl?: string): Response {
  const challenge = resourceMetadataUrl
    ? `Bearer error="unauthorized", error_description="Authorization needed", resource_metadata="${resourceMetadataUrl}"`
    : 'Bearer realm="mcp"';
  return new Response(JSON.stringify({ error: "unauthorized", message: "A valid bearer token is required." }), {
    status: 401,
    headers: { "content-type": "application/json", "www-authenticate": challenge },
  });
}

export type AuthResult =
  | { kind: "bearer"; token: string }
  | { kind: "oauth"; subject: string; clientId?: string; email?: string };

/** Returns who is calling, or a 401 response when the request is not allowed. */
export async function authenticate(request: Request, config: AuthConfig): Promise<Response | AuthResult> {
  const header = request.headers.get("authorization");
  const match = /^Bearer (.+)$/.exec(header ?? "");
  if (!match) {
    logReject(header ? "not_bearer" : "no_token", header);
    return unauthorized(config.resourceMetadataUrl);
  }
  const token = match[1];

  // Path A: one of our own bearer tokens. The endpoint checks it against its stored hash.
  if (token.startsWith("rt_")) return { kind: "bearer", token };

  // Path B: OAuth access token. Checks signature, issuer, audience, and expiry.
  if (config.oauth) {
    try {
      const { payload } = await jwtVerify(token, tagKeyFetchFailures(config.oauth.keys ?? remoteKeys(config.oauth.issuer)), {
        issuer: config.oauth.issuer,
        audience: config.oauth.audience,
      });
      if (!payload.sub) {
        logReject("no_subject");
        return unauthorized(config.resourceMetadataUrl);
      }
      // The agent's app is named by the standard client_id claim (or azp in some providers).
      const clientId = [payload.client_id, payload.azp].find((v): v is string => typeof v === "string" && v.length > 0);
      const email = typeof payload.email === "string" ? payload.email : undefined;
      if (process.env.DEBUG_TOKEN_CLAIMS === "true") logClaimShape(payload, clientId);
      return { kind: "oauth", subject: payload.sub, clientId, email };
    } catch (e) {
      const reason = classify(e);
      logReject(reason, header, reason === "wrong_audience" ? audienceOf(token) : undefined);
      return unauthorized(config.resourceMetadataUrl);
    }
  }
  logReject("oauth_not_configured"); // OAuth is not set up here, so no token can pass
  return unauthorized(config.resourceMetadataUrl);
}
