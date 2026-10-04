import type { ReactNode } from "react";
import { MUSE_EXPERIMENTAL_LINE, MUSE_OBSERVED, MUSE_RECONNECT_HEADING, MUSE_RECONNECT_STEPS, MUSE_TIMED_OUT_BUTTON, MUSE_TIMED_OUT_HEADING, MUSE_TIMED_OUT_NOTE, museQuietNote } from "@/lib/strings";
import { cardNew, muted, primaryButton } from "../ui";

// What Your agents says about Muse. Everything here is what we saw in our own tests, as counts, and says nothing stronger.

export function MuseReconnectSteps({ open }: { open?: boolean }) {
  return (
    <details open={open}>
      <summary>
        <strong>{MUSE_RECONNECT_HEADING}</strong>
      </summary>
      <ol>
        {MUSE_RECONNECT_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  );
}

/** On a connected Muse's card: the limit, what we observed, and the reconnect steps (opened when Muse has been quiet for a while). */
export function MuseLimit({ quietHours }: { quietHours: number | null }) {
  return (
    <div style={muted}>
      <p role="note">
        <strong>{MUSE_EXPERIMENTAL_LINE}</strong>
      </p>
      <p>{MUSE_OBSERVED}</p>
      {quietHours !== null ? <p role="status">{museQuietNote(quietHours)}</p> : null}
      <MuseReconnectSteps open={quietHours !== null} />
    </div>
  );
}

/** Muse signed in but was never confirmed in time. One primary button, then the same reconnect steps. */
export function MuseTimedOut({ id, removeAction }: { id: string; removeAction: (formData: FormData) => void | Promise<void> }): ReactNode {
  return (
    <section style={cardNew} aria-label={MUSE_TIMED_OUT_HEADING}>
      <h3>{MUSE_TIMED_OUT_HEADING}</h3>
      <p>{MUSE_TIMED_OUT_NOTE}</p>
      <form action={removeAction}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className="btn-primary" style={primaryButton}>
          {MUSE_TIMED_OUT_BUTTON}
        </button>
      </form>
      <MuseReconnectSteps open />
    </section>
  );
}
