import type { AgentView } from "./agents-view";
import { needsFinishSetup } from "./onboarding";

// What needs the person on Your agents and Home (handoff: "Needs attention" holds agents that wait for a confirmation, agents whose setup is not
// finished, and agents whose connection timed out). All of it is read from our own records.

export interface Attention {
  confirm: AgentView[];
  finish: AgentView[];
  timedOut: AgentView[];
  count: number;
}

export function attentionOf(agents: AgentView[]): Attention {
  const confirm = agents.filter((a) => a.status === "unassigned");
  const finish = agents.filter((a) => needsFinishSetup(a));
  const timedOut = agents.filter((a) => a.status === "expired");
  return { confirm, finish, timedOut, count: confirm.length + finish.length + timedOut.length };
}
