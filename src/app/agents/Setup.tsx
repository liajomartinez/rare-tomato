import type { AgentView } from "@/lib/agents-view";
import { NO_TOOLS_CHECK_GOOD_REPLY, NO_TOOLS_CHECK_QUESTION, placementFor } from "@/lib/onboarding";
import {
  COPY_THE_LINE, MUSE_NO_REQUESTS, SETUP_NOT_FINISHED, SETUP_NOT_FINISHED_HELP, SETUP_WORKING, setupWorkingLine, STARTER_LIMITS, STARTER_LINE, STARTER_PLACEMENT_UNVERIFIED, STARTER_WHY,
  setupWorking, WHERE_TO_PASTE,
} from "@/lib/strings";
import { CopyButton } from "../care-sheet/CopyButton";
import { field, muted } from "../ui";

// The step after an agent is confirmed (O7): put the starter line in the agent's OWN instructions. The state shown here comes only from
// our audit log (a real get_rules or get_care_profile request from this connection). Nothing here says the line was placed.
// Designed: "One step left" (not finished) and "Working". Muse (experimental) has no starter-line step. Grok Bot keeps its optional wording.

const dateOf = (d: Date) => d.toISOString().slice(0, 10);

/** Where to paste it, how to check it took, and the honest limits. Collapsed by default. */
function PasteHelp({ agent, typeLabel, open }: { agent: AgentView; typeLabel: string; open: boolean }) {
  const place = placementFor(agent.type);
  return (
    <details open={open}>
      <summary>{WHERE_TO_PASTE}</summary>
      <p>
        {place.optional ? "If you want to, paste it" : "Paste it"} {place.where ? <>into {place.where}.</> : <>into {typeLabel}.</>}
      </p>
      {place.note ? <p style={muted}>{place.note}</p> : null}
      {!place.whereVerified ? <p style={muted}>{STARTER_PLACEMENT_UNVERIFIED}</p> : null}
      <p style={muted}>{STARTER_WHY}</p>
      {place.optional ? null : (
        <>
          <p>
            <strong>Check it took.</strong> Open a new chat in {typeLabel} and ask:
          </p>
          <textarea readOnly value={NO_TOOLS_CHECK_QUESTION} rows={2} style={field} aria-label="The check question" />
          <CopyButton text={NO_TOOLS_CHECK_QUESTION} label="Copy the question" />
          <p style={muted}>{NO_TOOLS_CHECK_GOOD_REPLY}</p>
        </>
      )}
      <ul style={muted}>
        {STARTER_LIMITS.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </details>
  );
}

export function Setup({ agent, typeLabel }: { agent: AgentView; typeLabel: string }) {
  const place = placementFor(agent.type);
  const state = agent.setup;

  // Muse is experimental: its status comes from the audit log like every agent's, but it is never "set up: not finished" because of the starter line.
  if (place.experimental) {
    return (
      <section aria-label={`Status of ${agent.name}`}>
        <p role="status">
          {state.kind === "working" ? (
            <>
              <strong>{SETUP_WORKING}</strong> <span>{setupWorkingLine(dateOf(state.at), state.asked)}</span>
            </>
          ) : (
            <span>{MUSE_NO_REQUESTS}</span>
          )}
        </p>
      </section>
    );
  }

  // Grok Bot (optional, not yet designed): behavior and wording are unchanged; only the tokens restyle it.
  if (place.optional) {
    return (
      <section aria-label={`Set up ${agent.name}`}>
        <p role="status">
          <strong>{state.kind === "working" ? setupWorking(state.at.toISOString().slice(0, 10), state.asked) : SETUP_NOT_FINISHED}</strong>
          {state.kind === "not_finished" ? <span style={muted}> {SETUP_NOT_FINISHED_HELP}</span> : null}
        </p>
        <details>
          <summary>Optional: tell {agent.name} to check Rare Tomato</summary>
          <p>{STARTER_WHY}</p>
          <p>
            <strong>If you want to, paste this line</strong> {place.where ? <>into {place.where}:</> : <>into {typeLabel}:</>}
          </p>
          {place.note ? <p style={muted}>{place.note}</p> : null}
          {!place.whereVerified ? <p style={muted}>{STARTER_PLACEMENT_UNVERIFIED}</p> : null}
          <textarea readOnly value={STARTER_LINE} rows={4} style={field} aria-label="The starter line" />
          <CopyButton text={STARTER_LINE} label="Copy the line" />
          <ul style={muted}>
            {STARTER_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </section>
    );
  }

  if (state.kind === "working") {
    return (
      <section aria-label={`Set up ${agent.name}`}>
        <p role="status">
          <strong>{SETUP_WORKING}</strong>
        </p>
        <p>{setupWorkingLine(dateOf(state.at), state.asked)}</p>
        {place.optional ? <PasteHelp agent={agent} typeLabel={typeLabel} open={false} /> : null}
      </section>
    );
  }

  // Not finished. Grok Bot keeps its optional wording (not yet designed); every other agent gets the designed "One step left" content.
  return (
    <section aria-label={`Set up ${agent.name}`}>
      <p role="status">
        <strong>{SETUP_NOT_FINISHED}</strong>
        <span style={muted}> {SETUP_NOT_FINISHED_HELP}</span>
      </p>
      <div className="dashed-box" aria-label="The starter line">
        {STARTER_LINE}
      </div>
      <p>
        <CopyButton text={STARTER_LINE} label={COPY_THE_LINE} primary />
      </p>
      <PasteHelp agent={agent} typeLabel={typeLabel} open={false} />
    </section>
  );
}
