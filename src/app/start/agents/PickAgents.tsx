"use client";

import { useState } from "react";
import { FLOW_AGENTS } from "@/lib/onboarding-flow";
import { S } from "@/lib/strings";
import { savePicks } from "../actions";

// Four tiles. Continue stays off until at least one is picked (state 3b: "Pick at least one to continue.").
export function PickAgents() {
  const P = S.onb.pick;
  const [count, setCount] = useState(0);
  return (
    <form action={savePicks} className="stack stack-5">
      <fieldset className="pick" aria-label={P.title}>
        {FLOW_AGENTS.map((a) => (
          <label key={a.key} className="tile">
            <input type="checkbox" name="agent" value={a.key} onChange={(e) => setCount((n) => n + (e.target.checked ? 1 : -1))} />
            {a.name}
            <span className="box" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 16 16" className="tick">
                <path d="M3 8.5l3.2 3.2L13 4.6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="stack stack-2">
        <button type="submit" className="btn-primary btn-block" disabled={count === 0}>
          {P.next}
        </button>
        {count === 0 ? (
          <p className="caption" style={{ textAlign: "center" }} role="status">
            {P.need}
          </p>
        ) : null}
      </div>
    </form>
  );
}
