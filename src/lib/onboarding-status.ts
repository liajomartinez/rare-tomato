import type { Db } from "@/db/client";
import { tenantDb } from "@/db/tenant";
import { statusOf } from "./agents-view";
import type { Connection } from "./connections";

// "Which of the five setup events have happened for this agent?" Read-only, for one person's own data. A page can ask this on a timer so it
// updates itself when an agent connects or makes its first real calls. Everything comes from our own records (the connection row, the audit
// log, the rules table); nothing here is agent-reported, and it says nothing about whether the agent follows a rule it read.

export interface OnboardingStatus {
  /** 1. The agent signed in and is waiting for the person to confirm it. */
  appeared: string | null;
  /** 2. The person confirmed it and named it. */
  confirmed: string | null;
  /** 3. The newest real get_rules request from this agent (null until the first one). */
  firstGetRules: string | null;
  /** 4. The newest real log_task request from this agent (null until the first one). */
  firstLogTask: string | null;
  /** 5. The person has approved at least one rule of their own (not tied to a particular agent). */
  firstRuleSaved: string | null;
  status: "unassigned" | "expired" | "active" | "revoked";
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

/** Returns null when this person has no such agent (so another person's agent id looks the same as a missing one). */
export async function onboardingStatus(db: Db, userId: string, agentId: string, now = new Date()): Promise<OnboardingStatus | null> {
  const t = tenantDb(db, userId);
  const conn = (await t.agentConnections.get(agentId)) as Connection | null;
  if (!conn) return null;
  const [calls, rules] = await Promise.all([t.latestAuditByConnection(["get_rules", "log_task"]), t.rules.list()]);
  const at = (action: string) => calls.find((c) => c.agentConnectionId === conn.id && c.action === action)?.at;
  const saved = rules
    .filter((r) => r.approvedAt && r.status !== "proposed")
    .map((r) => new Date(r.approvedAt as Date).getTime())
    .sort((a, b) => a - b)[0];
  return {
    appeared: iso(conn.createdAt),
    confirmed: iso(conn.linkConfirmedAt),
    firstGetRules: iso(at("get_rules")),
    firstLogTask: iso(at("log_task")),
    firstRuleSaved: saved ? new Date(saved).toISOString() : null,
    status: statusOf(conn, now),
  };
}
