"use client";

import { useActionState, useState } from "react";
import { REASONS } from "@/lib/feedback-reasons";
import {
  DRAFTING_RULE, NOTE_LABEL, NOTE_PLACEHOLDER, SEND_LABEL, SHEET_CLOSE, SHEET_SUB, SHEET_TITLE, THUMBS_DISCLOSURE, THUMBS_DOWN_LABEL, THUMBS_UP_LABEL, YOU_RATED_DOWN, YOU_RATED_UP,
} from "@/lib/strings";
import { field, muted, primaryButton } from "../ui";
import { saveFeedback, type FeedbackState } from "./actions";

// Thumbs up is one tap. Thumbs down is: the thumb, one reason, Send (three taps). The note is optional (run 7).
// After Send a rule is drafted and shown on Your rules; the person lands there, or back here with a banner if no rule could be drafted.
// The design: thumbs buttons 44px high and 56px wide (thumbs down is the blue one); tapping thumbs down opens a bottom sheet over a dimmed page.
// The icons are drawn here as SVG (the design's icons) and carry the accessible labels "Thumbs up" and "Thumbs down".

function ThumbIcon({ down }: { down?: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" style={down ? { transform: "rotate(180deg)" } : undefined}>
      <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3Zm0 0 4-7a2 2 0 0 1 2 2v4h5.5a1.5 1.5 0 0 1 1.46 1.84l-1.4 6A1.5 1.5 0 0 1 17.1 18H7" />
    </svg>
  );
}

export function FeedbackForm({ taskId, rating, returnTo = "/feed" }: { taskId: string; rating?: "up" | "down"; returnTo?: string }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(saveFeedback, {});
  const [open, setOpen] = useState(false);

  return (
    <form action={action} aria-label="Your feedback on this task">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <p style={{ margin: "0.5rem 0", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button type="submit" name="rating" value="up" className="thumb" disabled={pending} aria-pressed={rating === "up"} aria-label={THUMBS_UP_LABEL}>
          <ThumbIcon />
        </button>
        <button type="button" className="thumb thumb-down" onClick={() => setOpen(true)} aria-expanded={open} aria-haspopup="dialog" aria-pressed={rating === "down"} aria-label={THUMBS_DOWN_LABEL}>
          <ThumbIcon down />
        </button>
        {rating ? <span style={muted}>{rating === "up" ? YOU_RATED_UP : YOU_RATED_DOWN}</span> : null}
      </p>
      {open ? (
        <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setOpen(false)} onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
          <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={`sheet-title-${taskId}`}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <div>
                <h2 id={`sheet-title-${taskId}`} style={{ margin: 0 }}>
                  {SHEET_TITLE}
                </h2>
                <p style={{ ...muted, margin: "4px 0 8px" }}>{SHEET_SUB}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)}>
                {SHEET_CLOSE}
              </button>
            </div>
            <fieldset className="chips" aria-label={SHEET_TITLE}>
              {REASONS.map((r, i) => (
                <label key={r.code} className="chip">
                  <input type="radio" name="reason" value={r.code} autoFocus={i === 0} /> {r.label}
                </label>
              ))}
            </fieldset>
            <label htmlFor={`note-${taskId}`} style={{ display: "block", fontWeight: 600 }}>
              {NOTE_LABEL}
            </label>
            <textarea id={`note-${taskId}`} name="note" maxLength={1000} rows={3} placeholder={NOTE_PLACEHOLDER} style={field} />
            <p style={muted}>{THUMBS_DISCLOSURE}</p>
            <button type="submit" name="rating" value="down" className="btn-primary" style={{ ...primaryButton, width: "100%" }} disabled={pending}>
              {pending ? DRAFTING_RULE : SEND_LABEL}
            </button>
            {pending ? <p role="status">{DRAFTING_RULE} This can take a few seconds.</p> : null}
          </div>
        </div>
      ) : null}
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
