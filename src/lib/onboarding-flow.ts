import type { AgentType } from "./connections";
import { S } from "./strings";

// The first-login flow (design handoff, part A): pick agents, then for each one: setup step 1 (the starter line), connect, "is connected", try it.
// What is remembered between screens is only which agents were picked and whether the person chose "Do this later". Both live in two small
// cookies (named on the Privacy Notice); nothing about onboarding is stored on the server.

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

/** Claude's documented link: it opens the "Add custom connector" dialog with the name and address already filled in. The person still taps Add. */
export const claudeAddLink = (address: string) =>
  `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=${encodeURIComponent("Rare Tomato")}&connectorUrl=${encodeURIComponent(address)}`;

/** Opens a new Claude chat with the test message ready (Q15 in the handoff: assumed to work, not checked). */
export const claudeTestLink = () => `https://claude.ai/new?q=${encodeURIComponent(S.onb.connect.s4.message)}`;

/** What the guide data says for one agent (menu names stay data, O11). */
export const setupGuide = (a: FlowAgent) => S.onb.setup.guides[a.name];
