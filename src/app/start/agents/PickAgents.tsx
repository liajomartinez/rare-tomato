"use client";

import { useState } from "react";
import { FLOW_AGENTS } from "@/lib/onboarding-flow";
import { PICK } from "@/lib/onboarding-copy";
import { Tag } from "../../ui";
import { savePicks } from "../actions";
import { Actions, Later, OnbPage, StepHeader, Title } from "../onb";

// One choice (radio). Continue stays off until one is picked, and "Pick one to continue." says why. The buttons sit in the action group and point at the form.
export function PickAgents() {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <OnbPage
      header={<StepHeader agent="generic" at={1} />}
      actions={
        <Actions
          main={
            <button type="submit" form="pick-form" className="btn-primary btn-block" disabled={picked === null}>
              {PICK.button}
            </button>
          }
          links={<Later />}
        />
      }
    >
      <Title body={PICK.body}>{PICK.title}</Title>
      <form id="pick-form" action={savePicks}>
        <fieldset className="onb-pick" aria-label={PICK.title}>
          {FLOW_AGENTS.map((a) => (
            <label key={a.key} className="tile">
              <input type="radio" name="agent" value={a.key} checked={picked === a.key} onChange={() => setPicked(a.key)} />
              <span className="stack stack-1">
                <span className="row row-tight">
                  {a.name}
                  {a.key === "muse" ? <Tag>{PICK.exp}</Tag> : null}
                </span>
                {a.key === "muse" ? <span className="caption">{PICK.museLine}</span> : null}
              </span>
              <span className="box" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 16 16" className="tick">
                  <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </label>
          ))}
        </fieldset>
      </form>
      {picked === null ? (
        <p className="caption" role="status">
          {PICK.need}
        </p>
      ) : null}
    </OnbPage>
  );
}
