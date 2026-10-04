import type { Db } from "@/db/client";
import { tenantDb, type Row } from "@/db/tenant";

// The audit log as the person sees it (spec FR-H4): which agent read which kinds of information, and when.
// It records kinds and times only, never values. "Read" here means a request reached our server and we answered it; it never
// says an agent used or followed what it received.

export interface AuditEntry {
  at: Date;
  who: string;
  action: string;
  categories: string[];
}

const LABEL: Record<string, string> = {
  get_rules: "asked for your rules",
  get_care_profile: "asked for your details",
  log_task: "recorded a task",
  propose_correction: "passed on a correction",
  rule_approved: "you approved a rule",
};
const describeAction = (action: string): string =>
  LABEL[action] ?? (action.startsWith("refused:") ? `was turned away (${action.slice("refused:".length).replace(/_/g, " ")})` : action.replace(/_/g, " "));

export async function auditEntries(db: Db, userId: string, limit = 200): Promise<AuditEntry[]> {
  const t = tenantDb(db, userId);
  const [rows, connections] = await Promise.all([t.recentAudit(limit), t.agentConnections.list() as Promise<Row[]>]);
  const names = new Map(connections.map((c) => [c.id as string, c.name as string]));
  return rows.map((r) => ({
      at: r.at as Date,
      who: r.actor === "user" ? "You" : names.get(r.agentConnectionId as string) ?? "An agent you removed",
      action: describeAction(r.action as string),
      categories: (r.categoriesRead as string[]) ?? [],
    }));
}
