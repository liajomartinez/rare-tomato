import type { AgentType } from "./connections";

// The starter-line step that comes after an agent is confirmed (design item O7, approved by Lia in autonomous run #2, 2026-10-03).
//
// Why it exists: connected Claude and ChatGPT did not call Rare Tomato until the person's OWN instructions told them to
// (the project notes: 6 of 6 prompts each with the line, none in earlier tests without it; a small test, so a direction only).
//
// What the state means, and what it does not: it comes ONLY from our own audit log. "Working" means a real get_rules or get_care_profile
// request from that connection reached our server. "Not finished" means none has. We cannot see inside the agent, so nothing here says the
// line was placed, or that an agent follows a rule it read.

export { NO_TOOLS_CHECK_GOOD_REPLY, NO_TOOLS_CHECK_QUESTION, STARTER_LINE } from "./strings";

/** Only these two calls end "Set up: not finished". Refused calls are logged as "refused:<tool>" and never count. */
const COUNTED_ACTIONS = ["get_rules", "get_care_profile"] as const;

export type SetupState = { kind: "not_finished" } | { kind: "working"; at: Date; asked: "rules" | "details" };

export interface AuditCall {
  action: string;
  at: Date;
  agentConnectionId: string | null;
}

/** The state of one connection from its audit rows. Rows from other connections are ignored. */
export function setupState(connectionId: string, calls: AuditCall[]): SetupState {
  let latest: AuditCall | null = null;
  let latestRules: AuditCall | null = null;
  for (const c of calls) {
    if (c.agentConnectionId !== connectionId || !(COUNTED_ACTIONS as readonly string[]).includes(c.action)) continue;
    if (!latest || c.at > latest.at) latest = c;
    if (c.action === "get_rules" && (!latestRules || c.at > latestRules.at)) latestRules = c;
  }
  if (!latest) return { kind: "not_finished" };
  return latestRules ? { kind: "working", at: latestRules.at, asked: "rules" } : { kind: "working", at: latest.at, asked: "details" };
}

/** Only confirmed (active) agents are counted: an unconfirmed one cannot read anything yet. */
export function agentsNeedingStep(agents: { status: string; type?: string | null; setup: SetupState }[]): number {
  // Muse is experimental: the starter line is not a required step for it, so it is never counted here.
  return agents.filter((a) => a.status === "active" && a.setup.kind === "not_finished" && a.type !== "muse").length;
}

export interface StarterPlacement {
  /** Plain words for where the person pastes the line. null means we have not checked (VERIFY): the screen says so instead of guessing. */
  where: string | null;
  /** false = VERIFY: the menu name has not been checked in the agent. Never guess menu names (CLAUDE.md, O11). */
  whereVerified: boolean;
  /** true = the step is optional (the agent looked at the rules on its own in every test) and there is no saved-instructions place to check. */
  optional?: boolean;
  /** One extra plain sentence about this agent's place, shown under the line. */
  note?: string;
  /** Shown as experimental: the starter line is not a required step, and the agent is never counted as "one step left" because of it. */
  experimental?: boolean;
}

/** Kept as data so a menu change is a one-line change. Claude and ChatGPT are the two places the arm was run. */
export const STARTER_PLACEMENT: Record<AgentType, StarterPlacement> = {
  claude: { where: "Claude's preferences (the box for your own instructions to Claude in its settings)", whereVerified: true },
  chatgpt: { where: "ChatGPT's custom instructions (in its settings, under personalization)", whereVerified: true },
  // Muse (owner decision, 2026-10-03): shown as experimental. The standing line is NOT a required step for Muse and nobody is told to instruct it in
  // every chat. Its status comes from the audit log like every agent's.
  muse: { where: null, whereVerified: true, experimental: true },
  // Grok Bot, checked by Lia on 2026-10-03: it runs only in the desktop app. The only rules screen found (Settings, General, Bot, Auto-review Rules) is
  // about which actions are allowed automatically, NOT standing instructions, so the line must not go there. No instructions menu was found.
  grok: {
    where: "the start of a chat with Grok Bot",
    whereVerified: true,
    optional: true,
    note: "No setup step is needed: Grok Bot looked at the rules on its own in every test. We found no place where it keeps standing instructions. Do not paste the line into Auto-review Rules: that screen only decides which actions Grok Bot may take without asking.",
  },
  other: { where: null, whereVerified: false },
};

export const placementFor = (type: AgentType | null): StarterPlacement => (type ? STARTER_PLACEMENT[type] : STARTER_PLACEMENT.other);
