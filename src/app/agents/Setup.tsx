import type { AgentView } from "@/lib/agents-view";
import { placementFor } from "@/lib/onboarding";
import { MUSE_NO_REQUESTS, S, STARTER_LIMITS, STARTER_LINE, STARTER_PLACEMENT_UNVERIFIED } from "@/lib/strings";
import { CopyBlock } from "../care-sheet/CopyButton";
import { Banner, StatusIcon } from "../ui";

// What an agent card says about setup. The state shown here comes only from our audit log (a real get_rules or get_care_profile request from this
// connection). Nothing here says the line was placed. Designed (SPEC B5): the status, the "Next step" box and the steps. Grok Bot (optional) keeps its
// existing wording and is restyled only. Muse is experimental: no starter-line step, never "Set up: not finished" (owner decision, 2026-10-03).

/** "2 Oct": the day, from our own record (UTC). */
export const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function SetupStatus({ agent }: { agent: AgentView }) {
  const state = agent.setup;
  const muse = placementFor(agent.type).experimental;
  if (state.kind === "working") {
    return (
      <div className="stack stack-1" role="status">
        <div className="status-line">
          <StatusIcon kind="check" />
          <b>{S.agents.statusWorking(shortDate(state.at))}</b>
        </div>
      </div>
    );
  }
  if (muse) {
    return (
      <div className="status-line" role="status">
        <StatusIcon kind="outline" />
        <b>{MUSE_NO_REQUESTS}</b>
      </div>
    );
  }
  return (
    <div className="stack stack-0" role="status">
      <div className="status-line">
        <StatusIcon kind="outline" />
        <b>{S.agents.statusNot}</b>
      </div>
      <span className="caption status-help">{S.agents.statusNotHelp}</span>
    </div>
  );
}

/** The mist box under the status: what to do next, and the button that shows the steps. */
export function NextStepText({ agent, platform }: { agent: AgentView; platform: string }) {
  const place = placementFor(agent.type);
  if (agent.setup.kind === "working") return <>{S.agents.nothingToDo}</>;
  if (place.optional) return <>{S.onb.setup.guides["Grok Bot"].intro}</>;
  return <>{S.starter.heading + " to " + platform + "."}</>;
}

/** The numbered steps for an agent that needs the starter line (SPEC B5, "Setup opened: Claude"). Kept as data in onboarding.ts (O11). */
export function StarterSteps({ agent, platform }: { agent: AgentView; platform: string }) {
  const place = placementFor(agent.type);
  const H = S.starter;
  if (place.optional) {
    return (
      <div className="stack">
        {place.note ? <p className="caption">{place.note}</p> : null}
        <CopyBlock value={STARTER_LINE} buttonLabel={H.stepCopy} copiedLabel={S.onb.setup.copied} />
        <ul className="caption">
          {STARTER_LIMITS.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    );
  }
  const where = place.where ?? platform;
  return (
    <div className="stack stack-5">
      <ol className="steps">
        <li>
          <div className="stack stack-3">
            <span className="step-text">{H.stepCopy}</span>
            <CopyBlock value={H.line} buttonLabel="Copy line" copiedLabel={S.onb.setup.copied} tight />
          </div>
        </li>
        <li>
          <div className="stack stack-3">
            <span className="step-text">{H.stepPaste(where)}</span>
            <p className="caption">{H.pasteNote}</p>
            {!place.whereVerified ? <p className="caption">{STARTER_PLACEMENT_UNVERIFIED}</p> : null}
            {place.note ? <p className="caption">{place.note}</p> : null}
          </div>
        </li>
        <li>
          <div className="stack stack-3">
            <span className="step-text">{H.stepCheck}</span>
            <CopyBlock value={H.checkQ} buttonLabel="Copy question" copiedLabel={S.onb.setup.copied} tight />
          </div>
        </li>
        <li>
          <span className="step-text">{H.good}</span>
        </li>
      </ol>
      <Banner tone="info">{S.agents.see[0]}</Banner>
      <details>
        <summary>{H.whyLink}</summary>
        <p>{H.why}</p>
      </details>
    </div>
  );
}
