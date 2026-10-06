"use client";

import { useActionState } from "react";
import { BLOCKED_CHECK_NOTE, SENSITIVE_CARD_CHOICE, SENSITIVE_CARD_HEADING, SENSITIVE_CARD_WHAT, SENSITIVE_CARD_WHO, SENSITIVE_CONFIRM_LABEL } from "@/lib/strings";
import { button, field, muted } from "../ui";
import { saveFact, type FormState } from "./actions";

const LABEL: Record<string, string> = { preferences: "Preferences", contacts: "Contacts", family: "Family" };

export function FactForm({ defaults, submitLabel, showNote = true }: { defaults: { id?: string; category: string; key: string; value: string }; submitLabel: string; showNote?: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveFact, { values: defaults });
  const v = state.values ?? defaults;

  return (
    <form action={action} className="stack stack-2">
      {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
      <label>
        Kind of detail
        <select name="category" defaultValue={v.category} key={`c-${v.category}`} style={field}>
          {Object.entries(LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Short label
        <input name="key" defaultValue={v.key} key={`k-${v.key}-${state.ok}`} required maxLength={80} placeholder="For example: Tone" style={field} />
      </label>
      <label>
        The detail
        <textarea name="value" defaultValue={v.value} key={`v-${v.value}-${state.ok}`} required maxLength={1000} rows={3} style={field} />
      </label>
      {state.message ? (
        <p role={state.ok ? "status" : "alert"}>{state.ok ? state.message : `Please check: ${state.message}`}</p>
      ) : null}
      {state.needsConfirmation ? (
        <div role="group" aria-label="Please confirm" className="card card-ink">
          {state.health ? (
            <>
              <h3>{SENSITIVE_CARD_HEADING}</h3>
              <p>
                {SENSITIVE_CARD_WHAT} <strong>{v.key}</strong>: {v.value}
              </p>
              <p>
                {v.id
                  ? <>Can be seen by: <strong>{state.canSee && state.canSee.length ? state.canSee.join(", ") : "no agent right now"}</strong>.</>
                  : SENSITIVE_CARD_WHO}
              </p>
              <p style={muted}>{SENSITIVE_CARD_CHOICE}</p>
            </>
          ) : (
            <p>
              Can be seen by: <strong>{state.canSee && state.canSee.length ? state.canSee.join(", ") : "no agent right now"}</strong>. An agent can read it only if it asks.
            </p>
          )}
          <p>
            <label style={{ display: "block", minHeight: 44 }}>
              <input type="checkbox" name="confirm" /> {state.health ? SENSITIVE_CONFIRM_LABEL : "I want this saved."}
            </label>
          </p>
        </div>
      ) : null}
      {showNote ? <p style={muted}>{BLOCKED_CHECK_NOTE}</p> : null}
      <button type="submit" disabled={pending} style={button}>
        {pending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
