import type { ReactNode } from "react";
import {
  MUSE_EXPERIMENTAL_LINE, MUSE_OBSERVED, MUSE_RECONNECT_HEADING, MUSE_RECONNECT_STEPS, MUSE_TIMED_OUT_BUTTON, MUSE_TIMED_OUT_HEADING, MUSE_TIMED_OUT_NOTE, museQuietNote, S,
} from "@/lib/strings";
import { AgentAvatar } from "../ui";

// What Your agents says about Muse. Muse is shown as experimental (owner decision, 2026-10-03). Everything here is what we saw in our own tests,
// as counts, and says nothing stronger. Nobody is told to instruct Muse in every chat.

export function MuseReconnectSteps({ open }: { open?: boolean }) {
  return (
    <details open={open}>
      <summary>{MUSE_RECONNECT_HEADING}</summary>
      <ol className="steps">
        {MUSE_RECONNECT_STEPS.map((s) => (
          <li key={s}>
            <span className="step-text">{s}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}

/** On a connected Muse's card: the experimental line, the limit, what we observed, and the reconnect steps (opened when Muse has been quiet for a while). */
export function MuseLimit({ quietHours }: { quietHours: number | null }) {
  return (
    <div className="stack stack-3">
      <p role="note" className="strong-line">
        {MUSE_EXPERIMENTAL_LINE}
      </p>
      <p className="caption">{MUSE_OBSERVED}</p>
      {quietHours !== null ? (
        <p role="status" className="caption">
          {museQuietNote(quietHours)}
        </p>
      ) : null}
      <MuseReconnectSteps open={quietHours !== null} />
      <details>
        <summary>{S.muse.factsLink}</summary>
        <p className="caption">{S.muse.facts}</p>
      </details>
    </div>
  );
}

/** Muse signed in but was never confirmed in time. One primary button, then the same reconnect steps. */
export function MuseTimedOut({ id, removeAction }: { id: string; removeAction: (formData: FormData) => void | Promise<void> }): ReactNode {
  return (
    <section className="card card-ink card-roomy" aria-label={MUSE_TIMED_OUT_HEADING}>
      <div className="row row-nowrap">
        <AgentAvatar name="Muse" />
        <div className="stack stack-0">
          <b style={{ font: "var(--font-name-lg)" }}>{MUSE_TIMED_OUT_HEADING}</b>
          <span className="caption">Muse</span>
        </div>
      </div>
      <p>{MUSE_TIMED_OUT_NOTE}</p>
      <form action={removeAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-primary btn-block">
          {MUSE_TIMED_OUT_BUTTON}
        </button>
      </form>
      <div className="rule-above">
        <MuseReconnectSteps open />
      </div>
    </section>
  );
}
