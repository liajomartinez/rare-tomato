import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "@/db/client";
import type { TenantDb } from "@/db/tenant";
import { effectiveScopes, DEFAULT_SCOPES, type Connection } from "./connections";
import { findConnectionByTokenPrefix } from "./identity";
import type { Caller } from "./mcp";

// Bearer tokens are for the demo agent and local testing only (spec 7.2, path A). The real agents use OAuth.
// A token looks like  rt_<8 hex prefix>_<secret> . Only a hash of the secret is stored; the token is shown once.

export const TOKEN_RE = /^rt_([0-9a-f]{8})_([A-Za-z0-9_-]{32,})$/;
const hashSecret = (secret: string) => createHash("sha256").update(secret).digest("hex");

export function generateToken() {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomBytes(32).toString("base64url");
  return { token: `rt_${prefix}_${secret}`, prefix, hash: hashSecret(secret) };
}

/**
 * Creates (or, if one exists, rotates) the demo agent's connection and returns a NEW token.
 * Rotating replaces the stored hash, so any earlier token stops working at once. This is the only time
 * the token is visible.
 */
export async function issueDemoToken(t: TenantDb, name = "Demo agent"): Promise<{ connection: Connection; token: string }> {
  const { token, prefix, hash } = generateToken();
  const existing = ((await t.agentConnections.list()) as Connection[]).find((c) => c.tokenHash);
  const connection = (existing
    ? await t.agentConnections.update(existing.id, { tokenPrefix: prefix, tokenHash: hash, revokedAt: null })
    : await t.agentConnections.insert({
        name,
        type: "other",
        scopes: DEFAULT_SCOPES,
        linkConfirmedAt: new Date(),
        tokenPrefix: prefix,
        tokenHash: hash,
      })) as Connection;
  return { connection, token };
}

export type BearerResult = { ok: true; caller: Caller } | { ok: false; reason: "invalid" | "revoked" };

/** Checked on every call, so revoking takes effect immediately (FR-A4). */
export async function resolveBearerToken(db: Db, token: string, now = new Date()): Promise<BearerResult> {
  const m = TOKEN_RE.exec(token);
  if (!m) return { ok: false, reason: "invalid" };
  const conn = await findConnectionByTokenPrefix(db, m[1]);
  if (!conn?.tokenHash) return { ok: false, reason: "invalid" };
  const a = Buffer.from(hashSecret(m[2]), "hex");
  const b = Buffer.from(conn.tokenHash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "invalid" };
  if (conn.revokedAt) return { ok: false, reason: "revoked" };
  void now;
  return {
    ok: true,
    caller: {
      userId: conn.userId,
      connectionId: conn.id,
      scopes: effectiveScopes({ scopes: conn.scopes, linkConfirmedAt: conn.linkConfirmedAt }),
      confirmed: Boolean(conn.linkConfirmedAt),
    },
  };
}
