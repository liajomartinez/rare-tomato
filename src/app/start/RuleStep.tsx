"use client";

import { useState, type ReactNode } from "react";
import { saveFirstRule } from "./actions";
import { Actions, Later, OnbPage } from "./onb";

// Write your first rule (Claude C7). Save rule stays off until something is typed. The example is shown under the box and labelled Example.
// The form holds only the box; the buttons sit in the action group and point at it with form="first-rule-form" (a form cannot sit inside a form).
export function RuleStep({ agent, copy, header, top, error }: { agent: string; copy: { ph: string; exLabel: string; ex: string; save: string; quiet: string }; header: ReactNode; top: ReactNode; error?: string }) {
  const [text, setText] = useState("");
  return (
    <OnbPage
      header={header}
      actions={
        <Actions
          main={
            <button type="submit" form="first-rule-form" className="btn-primary btn-block" disabled={text.trim().length === 0}>
              {copy.save}
            </button>
          }
          links={<Later />}
        />
      }
    >
      {top}
      <form id="first-rule-form" action={saveFirstRule} className="stack stack-2">
        <input type="hidden" name="agent" value={agent} />
        <label className="visually-hidden" htmlFor="first-rule">
          {copy.ph}
        </label>
        <textarea id="first-rule" name="text" rows={3} maxLength={300} placeholder={copy.ph} value={text} onChange={(e) => setText(e.target.value)} />
        {error ? (
          <p role="alert" className="caption">
            {error}
          </p>
        ) : null}
      </form>
      <div className="onb-choose">
        <span className="eyebrow">{copy.exLabel}</span>
        <p>{copy.ex}</p>
      </div>
      <p className="caption">{copy.quiet}</p>
    </OnbPage>
  );
}
