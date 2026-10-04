import type { Db } from "@/db/client";
import { tenantDb, type Row, type TenantDb } from "@/db/tenant";
import { AccountDeleted, findOrCreateUser, SignupsClosed, type User } from "./identity";

// How an agent's OAuth sign-in becomes a "connection" (spec FR-A2 to FR-A4).
// Every new agent starts UNASSIGNED: it may call only the harmless status tool until the user
// confirms it on the Agents screen. Nothing here guesses which agent is which.

export const AGENT_TYPES = ["claude", "chatgpt", "muse", "grok", "other"] as const;
export type AgentType = (typeof AGENT_TYPES)[number];

export const DEFAULT_SCOPES = ["profile:basic", "rules:read", "tasks:write"];
export const ALL_SCOPES = ["profile:basic", "profile:contacts", "profile:family", "rules:read", "tasks:write"];
export const EXTRA_SCOPES = ALL_SCOPES.filter((s) => !DEFAULT_SCOPES.includes(s));

/** An unassigned connection stops working this long after it was created if not confirmed. */
export const UNASSIGNED_LIFETIME_DAYS = 7;
export const UNASSIGNED_LIFETIME_MS = UNASSIGNED_LIFETIME_DAYS * 24 * 60 * 60 * 1000;

export type Connection = Row & {
  id: string;
  type: AgentType | null;
  suggestedType: AgentType | null;
  name: string;
  scopes: string[];
  linkConfirmedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  oauthClientId: string | null;
  tokenHash: string | null;
  createdAt: Date;
};

/**
 * Agents whose sign-in identity is a web address we can recognise. This only suggests a type;
 * it never grants anything. Everyone else (for example Grok Bot and Muse) has an opaque code.
 */
export function suggestedTypeForClient(clientId: string): AgentType | null {
  try {
    const host = new URL(clientId).host;
    if (host === "claude.ai") return "claude";
    if (host === "chatgpt.com") return "chatgpt";
  } catch {
    // not a web address
  }
  return null;
}

/** What a connection may do. An unassigned connection has no scopes at all, whatever is stored (FR-A3). */
export function effectiveScopes(conn: Pick<Connection, "scopes" | "linkConfirmedAt">): string[] {
  return conn.linkConfirmedAt ? conn.scopes : [];
}

/** The user confirms a connection's type and name. The default scopes apply from now; extras only if chosen. */
export async function confirmConnection(
  t: TenantDb,
  id: string,
  input: { type: AgentType; name: string; extraScopes?: string[]; replaceId?: string },
  now = new Date(),
): Promise<Connection | null> {
  const all = (await t.agentConnections.list()) as Connection[];
  const conn = all.find((c) => c.id === id);
  if (!conn || conn.revokedAt) return null;
  if (!conn.linkConfirmedAt && conn.expiresAt && conn.expiresAt <= now) return null;
  // A person has one connection per agent type. If this type is taken, the person must say so explicitly:
  // "this replaces my old <agent>". Only the person's OWN connections are ever considered (they come from
  // their own list), so nobody's replace can touch another person's connection.
  const taken = all.filter((c) => c.id !== id && c.type === input.type);
  if (input.replaceId) {
    const old = taken.find((c) => c.id === input.replaceId);
    if (!old) throw new Error("That connection cannot be replaced.");
    // The old connection is disconnected and removed at once: its token stops working immediately.
    // Nothing is carried over from it: the new connection gets only the default permissions plus what is ticked now.
    await removeConnection(t, old.id, now);
  } else if (taken.length > 0) {
    throw new Error(`You already have a ${input.type} connection. Choose "This replaces my old ${taken[0].name}" to swap it.`);
  }
  const extras = (input.extraScopes ?? []).filter((s) => EXTRA_SCOPES.includes(s));
  return (await t.agentConnections.update(id, {
    type: input.type,
    name: input.name.trim().slice(0, 60),
    needsName: false,
    linkConfirmedAt: conn.linkConfirmedAt ?? now,
    expiresAt: null,
    scopes: [...DEFAULT_SCOPES, ...extras],
  })) as Connection | null;
}

/** Changing scopes is only possible once the connection is confirmed. */
export async function setScopes(t: TenantDb, id: string, scopes: string[]): Promise<Connection | null> {
  const conn = (await t.agentConnections.get(id)) as Connection | null;
  if (!conn || !conn.linkConfirmedAt) return null;
  const clean = scopes.filter((s) => ALL_SCOPES.includes(s));
  return (await t.agentConnections.update(id, { scopes: clean })) as Connection | null;
}

export async function renameConnection(t: TenantDb, id: string, name: string): Promise<Connection | null> {
  return (await t.agentConnections.update(id, { name: name.trim().slice(0, 60), needsName: false })) as Connection | null;
}

/** Revocation takes effect on the very next call, because every call re-checks (FR-A4). */
export async function revokeConnection(t: TenantDb, id: string, now = new Date()): Promise<Connection | null> {
  return (await t.agentConnections.update(id, { revokedAt: now })) as Connection | null;
}

/**
 * Removes a connection from the Agents screen (an expired, revoked or unwanted one). It frees the agent's
 * identity and its type, so the same agent can sign in again later and show up as a fresh unassigned one.
 */
export async function removeConnection(t: TenantDb, id: string, now = new Date()): Promise<boolean> {
  const updated = await t.agentConnections.update(id, {
    revokedAt: now, oauthClientId: null, type: null, tokenPrefix: null, tokenHash: null,
  });
  return updated ? t.agentConnections.softDelete(id) : false;
}

/** Cap on connected agents per person (FR-I1). */
export const CONNECTION_CAP = 5;
export type Failure = "account_setup_incomplete" | "revoked" | "expired" | "cap_reached";
export type Resolved =
  | { ok: true; user: User; connection: Connection; scopes: string[]; unassigned: boolean; isNew: boolean }
  | { ok: false; reason: Failure };

/**
 * Turns "this OAuth sign-in made a call" into a person and a connection.
 * - The person must have confirmed they are 18 or older (set up on the website).
 * - The connection always belongs to the person who completed the sign-in.
 * - A sign-in we have seen before reuses its connection.
 * - A new sign-in creates ONE unassigned connection (no scopes, expires in 7 days).
 * - An unassigned connection past its expiry is refused until the user removes it.
 */
export async function resolveOAuthConnection(
  db: Db,
  input: { authSubject: string; clientId: string; email?: string | null },
  now = new Date(),
): Promise<Resolved> {
  let user: User;
  try {
    user = await findOrCreateUser(db, { authSubject: input.authSubject, email: input.email });
  } catch (e) {
    if (e instanceof SignupsClosed) return { ok: false, reason: "account_setup_incomplete" }; // new accounts are paused: nothing is created
    if (e instanceof AccountDeleted) return { ok: false, reason: "account_setup_incomplete" }; // deleted: only a fresh sign-in on the website can start a new account
    throw e;
  }
  if (!user.adultAttestedAt) return { ok: false, reason: "account_setup_incomplete" };

  const t = tenantDb(db, user.id);
  const all = (await t.agentConnections.list()) as Connection[];
  let conn = all.find((c) => c.oauthClientId === input.clientId);
  let isNew = false;

  if (!conn) {
    if (all.filter((c) => !c.revokedAt).length >= CONNECTION_CAP) return { ok: false, reason: "cap_reached" };
    try {
      conn = (await t.agentConnections.insert({
        name: "New agent",
        needsName: true,
        suggestedType: suggestedTypeForClient(input.clientId),
        oauthClientId: input.clientId,
        expiresAt: new Date(now.getTime() + UNASSIGNED_LIFETIME_MS),
      })) as Connection;
      isNew = true;
    } catch (e) {
      // Two first requests from one agent at the same moment: the other one won. Use its connection instead of failing with a 500.
      const again = ((await t.agentConnections.list()) as Connection[]).find((c) => c.oauthClientId === input.clientId);
      if (!again) throw e;
      conn = again;
    }
  }

  if (conn.revokedAt) return { ok: false, reason: "revoked" };
  if (!conn.linkConfirmedAt && conn.expiresAt && conn.expiresAt <= now) return { ok: false, reason: "expired" };

  await t.agentConnections.update(conn.id, { lastSeenAt: now });
  return { ok: true, user, connection: conn, scopes: effectiveScopes(conn), unassigned: !conn.linkConfirmedAt, isNew };
}
