"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { REASONS } from "@/lib/feedback-reasons";
import { S } from "@/lib/strings";
import { saveFeedback, type FeedbackState } from "./actions";

// "Good" is one tap. "Not right" opens the sheet: pick at least one reason, an optional note, then Draft a rule (SPEC B1 and 1b).
// While the rule is drafted the whole sheet is replaced by the drafting state (nothing disabled, no controls). After that a rule is shown on
// Your rules; the person lands there, or back here with a banner if no rule could be drafted.
// The sheet is a bottom sheet on a phone and a centred dialog on a wide screen (CSS only). Escape or the dimmed page closes it.
// The buttons keep the accessible names "Good" and "Not right" (text, no emoji, as the design says).

export function FeedbackForm({
  taskId,
  rating,
  returnTo = "/feed",
  context,
  initialOpen = false,
}: {
  taskId: string;
  rating?: "up" | "down";
  returnTo?: string;
  /** The agent, time and text shown at the top of the sheet. */
  context?: { agent: string; when: string; text: string };
  /** Show the sheet already open (used by the screen checks in scripts/ux-fixtures.script.ts). */
  initialOpen?: boolean;
}) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(saveFeedback, {});
  const [open, setOpen] = useState(initialOpen);
  const [picked, setPicked] = useState(0);
  const first = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const H = S.sheet;

  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    setPicked(0);
    opener.current?.focus();
  };

  return (
    <form action={action} aria-label="Your feedback on this task">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <div className="row">
        <div className="row row-tight">
          <button type="submit" name="rating" value="up" className="rate" disabled={pending} aria-pressed={rating === "up"}>
            {S.feed.up}
          </button>
          <button ref={opener} type="button" className="rate" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-pressed={rating === "down"}>
            {S.feed.down}
          </button>
        </div>
      </div>
      {open ? (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && close()} onKeyDown={(e) => e.key === "Escape" && close()}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={`sheet-title-${taskId}`}>
            <div className="sheet-handle" aria-hidden="true" />
            {pending ? (
              <div className="sheet-drafting stack stack-3" role="status">
                <h3 id={`sheet-title-${taskId}`}>{H.drafting}</h3>
                <p className="caption">{H.draftingNote}</p>
                <span className="draft-bar" aria-hidden="true" />
              </div>
            ) : (
            <>
            <div className="row row-between row-nowrap">
              <h3 id={`sheet-title-${taskId}`}>{H.title}</h3>
              <button type="button" className="btn-quiet pull-right" onClick={close}>
                {H.close}
              </button>
            </div>
            {context ? (
              <div className="card card-quiet card-tight stack stack-2">
                <p className="eyebrow">
                  {context.agent} · {context.when}
                </p>
                <p className="list-text">{context.text}</p>
              </div>
            ) : null}
            <div className="stack stack-2">
              <span className="caption">{H.pickOne}</span>
              <fieldset className="chips" aria-label={H.reasonsLabel}>
                {REASONS.map((r, i) => (
                  <label key={r.code} className="chip">
                    <input
                      ref={i === 0 ? first : undefined}
                      type="checkbox"
                      name="reason"
                      value={r.code}
                      onChange={(e) => setPicked((n) => n + (e.target.checked ? 1 : -1))}
                    />
                    <svg className="tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {r.label}
                  </label>
                ))}
              </fieldset>
            </div>
            <div className="field">
              <label htmlFor={`note-${taskId}`}>{H.noteLabel}</label>
              <textarea id={`note-${taskId}`} name="note" maxLength={1000} rows={2} placeholder={H.notePlaceholder} />
            </div>
            <p className="caption">{H.ai}</p>
            <button type="submit" name="rating" value="down" className="btn-primary btn-block" disabled={picked === 0}>
              {H.cta}
            </button>
            <p className="caption" style={{ textAlign: "center" }}>
              {H.helper}
            </p>
            {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
            </>
            )}
          </div>
        </div>
      ) : null}
      {!open && state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
