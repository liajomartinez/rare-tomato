import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import type { AgentType, Connection } from "./connections";
import { effectiveScopes } from "./connections";
import { callsSeen, setupState, WATCHED_ACTIONS, type AuditCall, type CallsSeen, type SetupState } from "./onboarding";
import type { Category } from "./profile";

// What the Agents and Profile screens show. Never includes tokens or anything secret.

export type AgentStatus = "unassigned" | "expired" | "active" | "revoked";

export interface AgentView {
  id: string;
  name: string;
  type: AgentType | null;
  suggestedType: AgentType | null;
  scopes: string[];
  status: AgentStatus;
  lastSeenAt: Date | null;
  expiresAt: Date | null;
  usesBearer: boolean;
  /** From our own audit log: the last time a request for the rules reached our server. Never self-reported. */
  lastRulesFetchedAt: Date | null;
  /** The last task this agent recorded (agent-reported). */
  lastTaskAt: Date | null;
  /** Active, but no request from it for more than 7 days. */
  notSeenRecently: boolean;
  /** From our own audit log only: has a real get_rules or get_care_profile request from this connection reached us (see onboarding.ts). */
  setup: SetupState;
  /** The newest real get_rules, get_care_profile and log_task request from this connection, from our audit log (what the setup check watches for). */
  calls: CallsSeen;
}

export const NOT_SEEN_DAYS = 7;

export function statusOf(c: Pick<Connection, "revokedAt" | "linkConfirmedAt" | "expiresAt">, now = new Date()): AgentStatus {
  if (c.revokedAt) return "revoked";
  if (!c.linkConfirmedAt) return c.expiresAt && c.expiresAt <= now ? "expired" : "unassigned";
  return "active";
}

export async function listAgents(db: Db, userId: string, now = new Date()): Promise<AgentView[]> {
  const t = tenantDb(db, userId);
  const [rows, latestCalls, tasks] = await Promise.all([
    t.agentConnections.list() as Promise<Connection[]>,
    t.latestAuditByConnection([...WATCHED_ACTIONS]),
    t.tasks.list() as Promise<{ agentConnectionId: string; occurredAt: Date }[]>,
  ]);
  const latest = <T,>(items: T[], id: (x: T) => string | null, when: (x: T) => Date) => {
    const out = new Map<string, Date>();
    for (const item of items) {
      const key = id(item);
      if (key && (!out.has(key) || when(item) > out.get(key)!)) out.set(key, when(item));
    }
    return out;
  };
  const rulesAt = latest(latestCalls.filter((x) => x.action === "get_rules"), (x) => x.agentConnectionId, (x) => x.at);
  const taskAt = latest(tasks, (x) => x.agentConnectionId, (x) => x.occurredAt);
  const staleBefore = now.getTime() - NOT_SEEN_DAYS * 24 * 60 * 60 * 1000;
  return rows
    .map<AgentView>((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      suggestedType: c.suggestedType,
      scopes: effectiveScopes(c),
      status: statusOf(c, now),
      lastSeenAt: (c.lastSeenAt as Date | null) ?? null,
      expiresAt: c.expiresAt,
      usesBearer: Boolean(c.tokenHash),
      lastRulesFetchedAt: rulesAt.get(c.id) ?? null,
      lastTaskAt: taskAt.get(c.id) ?? null,
      setup: setupState(c.id, latestCalls as AuditCall[]),
      calls: callsSeen(c.id, latestCalls as AuditCall[]),
      notSeenRecently: statusOf(c, now) === "active" && Boolean(c.lastSeenAt) && (c.lastSeenAt as Date).getTime() < staleBefore,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const CATEGORY_SCOPE: Record<Category, string> = { preferences: "profile:basic", contacts: "profile:contacts", family: "profile:family" };

/** Who can see ONE detail: the agents that hold its category's permission, narrowed to the chosen ones when the person limited it. */
export function whoCanSeeFact(agents: AgentView[], category: Category, allowedAgentIds: string[] | null): string[] {
  return agents
    .filter((a) => a.status === "active" && a.scopes.includes(CATEGORY_SCOPE[category]) && (allowedAgentIds === null || allowedAgentIds.includes(a.id)))
    .map((a) => a.name);
}

/** For each category, the names of the active agents that can read it (shown on the Profile screen). */
export function whoCanSee(agents: AgentView[]): Record<Category, string[]> {
  const out: Record<Category, string[]> = { preferences: [], contacts: [], family: [] };
  for (const a of agents.filter((x) => x.status === "active")) {
    for (const c of Object.keys(CATEGORY_SCOPE) as Category[]) if (a.scopes.includes(CATEGORY_SCOPE[c])) out[c].push(a.name);
  }
  return out;
}

/** The names of the connected agents that can read a rule: it is for everyone ("all") or for one agent, and the agent must be allowed to read rules. */
export function whoCanSeeRule(agents: AgentView[], scope: string): string[] {
  return agents
    .filter((a) => a.status === "active" && a.scopes.includes("rules:read") && (scope === "all" || scope === `agent:${a.id}`))
    .map((a) => a.name);
}
