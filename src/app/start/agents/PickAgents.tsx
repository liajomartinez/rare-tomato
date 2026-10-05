"use client";

import { useState } from "react";
import { FLOW_AGENTS } from "@/lib/onboarding-flow";
import { S } from "@/lib/strings";
import { Tag } from "../../ui";
import { savePicks } from "../actions";

// Which agent do you want to connect first? (SPEC 3). Four full-width rows, one choice (radio). Muse carries an Experimental tag. Continue stays off until
// one is picked (state 3b: "Pick one to continue."). The others can be added later.
export function PickAgents() {
  const P = S.onb.pick;
  const [picked, setPicked] = useState<string | null>(null);
  return (
    <form action={savePicks} className="stack stack-5">
      <fieldset className="pick pick-one" aria-label={P.title}>
        {FLOW_AGENTS.map((a) => (
          <label key={a.key} className="tile">
            <input type="radio" name="agent" value={a.key} checked={picked === a.key} onChange={() => setPicked(a.key)} />
            <span className="row row-tight">
              {a.name}
              {a.key === "muse" ? <Tag strong>{P.experimental}</Tag> : null}
            </span>
            <span className="box" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" className="tick">
                <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="stack stack-2">
        <button type="submit" className="btn-primary btn-block" disabled={picked === null}>
          {P.next}
        </button>
        {picked === null ? (
          <p className="caption" style={{ textAlign: "center" }} role="status">
            {P.need}
          </p>
        ) : null}
      </div>
    </form>
  );
}
