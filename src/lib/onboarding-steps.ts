import type { AgentView } from "./agents-view";
import type { AgentKey } from "./onboarding-copy";

// Where a person is in the setup of one agent, from our own records only. Used by the setup page (to land on the first step not done yet) and by
// Home's "Finish setting up" card. Nothing here comes from a button the person pressed.

export const STEPS = ["intro", "form", "wait", "instruction", "check", "rule", "done"] as const;
export type Step = (typeof STEPS)[number];

/** Claude and ChatGPT have the guided connect and instruction screens; Grok Bot and Muse are one pasted message. */
export const GUIDED: Record<AgentKey, boolean> = { claude: true, chatgpt: true, grok: false, muse: false };

type Seen = Pick<AgentView, "calls">;

/** Ready means both real calls reached our server: get_rules and log_task. */
export const isReady = (a: Seen): boolean => Boolean(a.calls.rules && a.calls.task);

/** The first step that is not done yet. `mine` is the agent's confirmed connection, if there is one. */
export function resumeStep(key: AgentKey, mine: Seen | undefined, hasRule: boolean): Step {
  if (!mine) return GUIDED[key] ? "intro" : "form";
  if (isReady(mine)) return hasRule ? "done" : "rule";
  if (GUIDED[key] && !mine.calls.rules) return "instruction";
  return "check";
}

/** Which of the three rail steps is "now" for the step being shown (1 to 3). */
export function railAt(key: AgentKey, step: Step): 1 | 2 | 3 {
  if (step === "intro" || step === "form" || step === "wait") return 1;
  if (step === "instruction" || step === "check") return 2;
  return 3;
}
