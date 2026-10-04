import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { flowAgent } from "@/lib/onboarding-flow";
import { currentSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { confirmAgent, revokeAgent } from "../../agents/actions";
import { Head, Narrow } from "../parts";

export const dynamic = "force-dynamic";

// "Claude is connected." (SPEC A6): confirm it is yours. "Connected" here means it signed in, not yet confirmed. Until the person confirms,
// the agent can only say hello and cannot read any detail. Confirming uses the same action as Your agents.
export default async function Arrived({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const session = await currentSession();
  if (session.status !== "ready") redirect("/start/account");
  const q = await searchParams;
  const agent = flowAgent(q.agent);
  if (!agent) redirect("/start/agents");
  const agents = await agentsFor(session.person.id).list();
  const waiting = agents.find((a) => a.status === "unassigned" && a.suggestedType === agent.type) ?? agents.find((a) => a.status === "unassigned");
  if (!waiting) redirect(`/start/connect?agent=${agent.key}&step=3`);
  const A = S.onb.arrived;
  const replaceable = agents.filter((a) => a.type === agent.type && a.status !== "unassigned" && a.status !== "expired");
  return (
    <Narrow>
      <Head title={A.title(agent.name)} body={A.body} />
      <form action={confirmAgent} className="stack stack-5">
        <input type="hidden" name="id" value={waiting.id} />
        <input type="hidden" name="type" value={agent.type} />
        <input type="hidden" name="next" value={`/start/try?agent=${agent.key}`} />
        <div className="field">
          <label htmlFor="name">{A.nameLabel}</label>
          <input id="name" name="name" defaultValue={agent.name} required maxLength={60} />
          <span className="hint">{A.nameHint}</span>
        </div>
        {replaceable.length > 0 ? (
          <div className="field">
            <label htmlFor="replaceId">Is this the same agent reconnecting?</label>
            <select id="replaceId" name="replaceId" defaultValue="">
              <option value="">No, this is a new agent</option>
              {replaceable.map((e) => (
                <option key={e.id} value={e.id}>
                  This replaces my old {e.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <button type="submit" className="btn-primary btn-block">
          {A.confirm}
        </button>
      </form>
      <form action={revokeAgent}>
        <input type="hidden" name="id" value={waiting.id} />
        <div style={{ textAlign: "center" }}>
          <button type="submit" className="btn-quiet">
            {A.notMine}
          </button>
        </div>
      </form>
    </Narrow>
  );
}
