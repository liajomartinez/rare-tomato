import type { AgentType } from "./connections";

// Setup state for an agent (design handoff rev 8: "Setup success comes from real tool calls, not from 'I did it' buttons").
//
// What the state means, and what it does not: it comes ONLY from our own audit log. "Checked your rules" means a real get_rules request from that
// connection reached our server. "Reported the test task" means a real log_task request did. We cannot see inside the agent, so nothing here says the
// instruction was placed, or that an agent follows a rule it read. Refused calls are logged as "refused:<tool>" and never count.

export { AGENT_INSTRUCTION } from "./strings";

/** The calls we look for. get_care_profile still counts as "has checked Rare Tomato" for the status line on Your agents (an agent that read details did call us). */
export const WATCHED_ACTIONS = ["get_rules", "get_care_profile", "log_task"] as const;

export interface AuditCall {
  action: string;
  at: Date;
  agentConnectionId: string | null;
}

/** The newest real call of each kind from ONE connection. Rows from other connections, and refused calls, are ignored. */
export interface CallsSeen {
  rules: Date | null;
  details: Date | null;
  task: Date | null;
}

export function callsSeen(connectionId: string, calls: AuditCall[]): CallsSeen {
  const seen: CallsSeen = { rules: null, details: null, task: null };
  for (const c of calls) {
    if (c.agentConnectionId !== connectionId) continue;
    const key = c.action === "get_rules" ? "rules" : c.action === "get_care_profile" ? "details" : c.action === "log_task" ? "task" : null;
    if (!key) continue;
    if (!seen[key] || c.at > (seen[key] as Date)) seen[key] = c.at;
  }
  return seen;
}

export type SetupState = { kind: "not_finished" } | { kind: "working"; at: Date; asked: "rules" | "details" };

/** The state of one connection from its audit rows. "Working" means a real get_rules or get_care_profile request has reached our server. */
export function setupState(connectionId: string, calls: AuditCall[]): SetupState {
  const seen = callsSeen(connectionId, calls);
  if (seen.rules) return { kind: "working", at: seen.rules, asked: "rules" };
  if (seen.details) return { kind: "working", at: seen.details, asked: "details" };
  return { kind: "not_finished" };
}

/** How each platform is set up (handoff: Claude and ChatGPT use guided settings; Grok Bot and Muse use one pasted message). */
export type SetupKind = "guided" | "message" | "none";
export const SETUP_KIND: Record<AgentType, SetupKind> = { claude: "guided", chatgpt: "guided", grok: "message", muse: "message", other: "none" };
export const setupKindFor = (type: AgentType | null): SetupKind => (type ? SETUP_KIND[type] : "none");

/**
 * The verify step for Claude and ChatGPT (3 states in the handoff): waiting (neither call seen), partly done (get_rules seen, log_task not),
 * ready (both seen). A log_task with no get_rules is still "waiting": the agent has not checked the rules.
 */
export type VerifyState = "waiting" | "partial" | "ready";
export function verifyState(seen: CallsSeen): VerifyState {
  if (seen.rules && seen.task) return "ready";
  if (seen.rules) return "partial";
  return "waiting";
}

/** Grok Bot and Muse show ready after the first real call (get_rules or log_task). */
export const messageReady = (seen: CallsSeen): boolean => Boolean(seen.rules || seen.task);

/** Does a confirmed agent still need a step from the person? Claude and ChatGPT until get_rules is seen; Grok Bot and Muse until any real call is seen. */
export function needsFinishSetup(a: { status: string; type?: AgentType | null; calls: CallsSeen; setup: SetupState }): boolean {
  if (a.status !== "active") return false;
  const kind = setupKindFor(a.type ?? null);
  if (kind === "guided") return a.setup.kind === "not_finished";
  if (kind === "message") return !messageReady(a.calls) && a.setup.kind === "not_finished";
  return false;
}
