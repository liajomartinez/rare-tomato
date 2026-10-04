import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { listAgents } from "./agents-view";
import {
  AGENT_TYPES, ALL_SCOPES, confirmConnection, removeConnection, renameConnection, revokeConnection, setScopes, type AgentType,
} from "./connections";
import { logSafeError, SafeDbError } from "./safe-log";

// The actions behind the Agents screen. Every one works only on the signed-in person's own connections.

export type AgentActionResult = { ok: true } | { ok: false; message: string };

export function agentsAdmin(db: Db, userId: string) {
  const t = tenantDb(db, userId);
  const asType = (v: string): AgentType | null => ((AGENT_TYPES as readonly string[]).includes(v) ? (v as AgentType) : null);

  return {
    list: () => listAgents(db, userId),

    async confirm(id: string, input: { type: string; name: string; extraScopes: string[]; replaceId?: string }): Promise<AgentActionResult> {
      const type = asType(input.type);
      if (!type) return { ok: false, message: "Choose which agent this is." };
      if (!input.name.trim()) return { ok: false, message: "Give this agent a name." };
      try {
        const done = await confirmConnection(t, id, { type, name: input.name, extraScopes: input.extraScopes, replaceId: input.replaceId || undefined });
        return done ? { ok: true } : { ok: false, message: "This agent can no longer be confirmed. Remove it and connect it again." };
      } catch (error) {
        logSafeError(error, "agents-admin");
        // Only the messages we wrote ourselves are shown; anything else (for example a database error) gets the plain sentence.
        return { ok: false, message: error instanceof Error && !(error instanceof SafeDbError) && /^(You already have|That connection)/.test(error.message) ? error.message : "Could not confirm this agent." };
      }
    },

    async rename(id: string, name: string): Promise<AgentActionResult> {
      if (!name.trim()) return { ok: false, message: "Give this agent a name." };
      return (await renameConnection(t, id, name)) ? { ok: true } : { ok: false, message: "That agent was not found." };
    },

    /** Only for confirmed agents. Unknown scope names are ignored. */
    async changeAccess(id: string, scopes: string[]): Promise<AgentActionResult> {
      const clean = scopes.filter((s) => ALL_SCOPES.includes(s));
      return (await setScopes(t, id, clean)) ? { ok: true } : { ok: false, message: "Confirm this agent first." };
    },

    async revoke(id: string): Promise<AgentActionResult> {
      return (await revokeConnection(t, id)) ? { ok: true } : { ok: false, message: "That agent was not found." };
    },

    async remove(id: string): Promise<AgentActionResult> {
      return (await removeConnection(t, id)) ? { ok: true } : { ok: false, message: "That agent was not found." };
    },
  };
}

export type AgentsAdmin = ReturnType<typeof agentsAdmin>;
