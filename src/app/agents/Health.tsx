import type { AgentView } from "@/lib/agents-view";
import { muted } from "../ui";

// Connection health (spec FR-A5). Every time below comes from OUR OWN server records, never from the agent.
// The wording only says that a request arrived. It must never say or suggest that an agent followed or used the rules.

const when = (d: Date | null) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "not yet");

export function Health({ agent }: { agent: AgentView }) {
  return (
    <div style={muted}>
      <p>Last seen: {when(agent.lastSeenAt)}</p>
      <p>Last asked for your rules: {when(agent.lastRulesFetchedAt)}. Our server records this when a request for your rules arrives.</p>
      <p>
        Last task it recorded: {when(agent.lastTaskAt)}
        {agent.lastTaskAt ? " (agent-reported)" : ""}
      </p>
      {agent.notSeenRecently ? <p role="status">We have not seen this agent for more than 7 days.</p> : null}
    </div>
  );
}
