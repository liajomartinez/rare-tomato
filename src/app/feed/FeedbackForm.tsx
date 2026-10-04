"use client";

import { useActionState, useState } from "react";
import { REASONS } from "@/lib/feedback-reasons";
import { button, field, muted } from "../ui";
import { DRAFTING_RULE, THUMBS_DISCLOSURE } from "@/lib/strings";
import { saveFeedback, type FeedbackState } from "./actions";

// Thumbs up is one tap. Thumbs down is: the thumb, one reason, Send (three taps). The note is optional (run 7).
// After Send a rule is drafted and shown on Your rules; the person lands there, or back here with a banner if no rule could be drafted.

export function FeedbackForm({ taskId, rating, returnTo = "/feed" }: { taskId: string; rating?: "up" | "down"; returnTo?: string }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(saveFeedback, {});
  const [open, setOpen] = useState(false);

  return (
    <form action={action} aria-label="Your feedback on this task">
      <input type="hidden" name="taskId" value={taskId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <p style={{ margin: "0.5rem 0" }}>
        <button type="submit" name="rating" value="up" style={button} disabled={pending} aria-pressed={rating === "up"} aria-label="Thumbs up">
          👍
        </button>{" "}
        <button type="button" style={button} onClick={() => setOpen(!open)} aria-expanded={open} aria-pressed={rating === "down"} aria-label="Thumbs down">
          👎
        </button>{" "}
        {rating ? <span style={muted}>You rated this {rating === "up" ? "👍" : "👎"}. Tap again to change it.</span> : null}
      </p>
      {open ? (
        <fieldset style={{ border: "1px solid #888", borderRadius: 8, margin: "0.5rem 0" }}>
          <legend>What went wrong?</legend>
          {REASONS.map((r) => (
            <label key={r.code} style={{ display: "block", minHeight: 44 }}>
              <input type="checkbox" name="reason" value={r.code} /> {r.label}
            </label>
          ))}
          <label>
            Anything to add? (optional: a few words in your own words make a better rule)
            <textarea name="note" maxLength={1000} rows={3} style={field} />
          </label>
          <p style={muted}>{THUMBS_DISCLOSURE}</p>
          <button type="submit" name="rating" value="down" style={button} disabled={pending}>
            {pending ? DRAFTING_RULE : "Send"}
          </button>
          {pending ? <p role="status">{DRAFTING_RULE} This can take a few seconds.</p> : null}
        </fieldset>
      ) : null}
      {state.message ? <p role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
