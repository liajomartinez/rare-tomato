import type { AgentView } from "@/lib/agents-view";
import { MUSE_EXPIRED_BODY, S, TIMED_OUT_BODY } from "@/lib/strings";
import { AgentAvatar, StatusIcon, Tag } from "../ui";
import { reconnectAgent, removeAgent } from "./actions";

/**
 * An agent whose connection expired: its own name, an Expired label (icon plus word), one Reconnect button and a small Remove link.
 * Used on Connected Agents (under Needs attention) and on Home. Never "Old <name>".
 */
export function ExpiredCard({ agent, primary }: { agent: Pick<AgentView, "id" | "name" | "type" | "suggestedType">; primary?: boolean }) {
  const muse = agent.type === "muse" || agent.suggestedType === "muse";
  return (
    <article className="card card-roomy" aria-label={agent.name}>
      <div className="row row-nowrap">
        <AgentAvatar name={agent.name} />
        <div className="stack stack-0 grow">
          <b style={{ font: "var(--font-name-lg)" }}>{agent.name}</b>
        </div>
        {muse ? <Tag strong>{S.agents.experimental}</Tag> : null}
      </div>
      <div className="status-line" role="status">
        <StatusIcon kind="alert" />
        <b>{S.agents.expired}</b>
      </div>
      <p className="caption">{muse ? MUSE_EXPIRED_BODY : TIMED_OUT_BODY}</p>
      <form action={reconnectAgent}>
        <input type="hidden" name="id" value={agent.id} />
        <button type="submit" className={`btn-block${primary ? " btn-primary" : ""}`}>
          {S.agents.reconnect}
        </button>
      </form>
      <form action={removeAgent}>
        <input type="hidden" name="id" value={agent.id} />
        <button type="submit" className="btn-quiet btn-sm">
          {S.agents.remove}
        </button>
      </form>
    </article>
  );
}
