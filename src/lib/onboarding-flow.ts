import type { AgentType } from "./connections";

// The first-login flow (design handoff rev 8, part A): pick one agent, then its setup (Claude and ChatGPT: connect, add the instruction, make sure it works;
// Grok Bot and Muse: one pasted message), then Continue or Connect another agent. What is remembered between screens is only which agents were picked and
// whether the person chose "Do this later". Both live in two small cookies (named on the Privacy Notice); nothing about onboarding is stored on the server.

export const FLOW_AGENTS = [
  { key: "claude", name: "Claude", type: "claude" },
  { key: "chatgpt", name: "ChatGPT", type: "chatgpt" },
  { key: "grok", name: "Grok Bot", type: "grok" },
  { key: "muse", name: "Muse", type: "muse" },
] as const satisfies readonly { key: string; name: string; type: AgentType }[];

export type FlowKey = (typeof FLOW_AGENTS)[number]["key"];
export type FlowAgent = (typeof FLOW_AGENTS)[number];

export const PICKED_COOKIE = "rt_picked";
export const LATER_COOKIE = "rt_later";
export const FLOW_COOKIE_DAYS = 30;

export const flowAgent = (key: string | undefined): FlowAgent | undefined => FLOW_AGENTS.find((a) => a.key === key);

/** The picked agents, in the order of the pick screen, with anything unknown dropped. */
export function parsePicked(value: string | undefined): FlowAgent[] {
  const wanted = new Set((value ?? "").split(",").map((x) => x.trim()));
  return FLOW_AGENTS.filter((a) => wanted.has(a.key));
}

/** The agent after this one in the picked list, or undefined when it was the last. */
export function nextPicked(picked: FlowAgent[], current: FlowKey): FlowAgent | undefined {
  const i = picked.findIndex((a) => a.key === current);
  return i >= 0 ? picked[i + 1] : undefined;
}
