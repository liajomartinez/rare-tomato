import type { AgentView } from "@/lib/agents-view";
import { NO_TOOLS_CHECK_GOOD_REPLY, NO_TOOLS_CHECK_QUESTION, placementFor } from "@/lib/onboarding";
import {
  SETUP_NOT_FINISHED,
  SETUP_NOT_FINISHED_HELP,
  setupWorking,
  STARTER_LIMITS,
  STARTER_LINE,
  STARTER_PLACEMENT_UNVERIFIED,
  STARTER_WHY,
} from "@/lib/strings";
import { CopyButton } from "../care-sheet/CopyButton";
import { field, muted } from "../ui";

// The step after an agent is confirmed (O7): put the starter line in the agent's OWN instructions. The state shown here comes only from
// our audit log (a real get_rules or get_care_profile request from this connection). Nothing here says the line was placed.

export function Setup({ agent, typeLabel }: { agent: AgentView; typeLabel: string }) {
  const place = placementFor(agent.type);
  const state = agent.setup;
  if (place.chatSentence) {
    // An agent where the standing line did not make it check (Muse): offer the sentence to say in the chat, and the facts. No standing line.
    return (
      <section aria-label={`Set up ${agent.name}`}>
        <p role="status">
          <strong>{state.kind === "working" ? setupWorking(state.at.toISOString().slice(0, 10), state.asked) : SETUP_NOT_FINISHED}</strong>
          {state.kind === "not_finished" ? <span style={muted}> {SETUP_NOT_FINISHED_HELP}</span> : null}
        </p>
        <details open={state.kind === "not_finished"}>
          <summary>One more step: tell {agent.name} in the chat</summary>
          <p>{place.note}</p>
          <p>
            <strong>Say this to {typeLabel} in the chat</strong> when you want it to check Rare Tomato:
          </p>
          <textarea readOnly value={place.chatSentence} rows={3} style={field} aria-label="The sentence to say in the chat" />
          <CopyButton text={place.chatSentence} label="Copy the sentence" />
          <ul style={muted}>
            {STARTER_LIMITS.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      </section>
    );
  }
  return (
    <section aria-label={`Set up ${agent.name}`}>
      <p role="status">
        <strong>{state.kind === "working" ? setupWorking(state.at.toISOString().slice(0, 10), state.asked) : SETUP_NOT_FINISHED}</strong>
        {state.kind === "not_finished" ? <span style={muted}> {SETUP_NOT_FINISHED_HELP}</span> : null}
      </p>
      <details open={state.kind === "not_finished" && !place.optional}>
        <summary>
          {place.optional ? "Optional" : "One more step"}: tell {agent.name} to check Rare Tomato
        </summary>
        <p>{STARTER_WHY}</p>
        <p>
          <strong>{place.optional ? "If you want to, paste this line" : "Paste this line"}</strong> {place.where ? <>into {place.where}:</> : <>into {typeLabel}:</>}
        </p>
        {place.note ? <p style={muted}>{place.note}</p> : null}
        {!place.whereVerified ? <p style={muted}>{STARTER_PLACEMENT_UNVERIFIED}</p> : null}
        <textarea readOnly value={STARTER_LINE} rows={4} style={field} aria-label="The starter line" />
        <CopyButton text={STARTER_LINE} label="Copy the line" />
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
    </section>
  );
}
