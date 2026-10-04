"use client";

import Link from "next/link";
import { useState } from "react";
import { S } from "@/lib/strings";

// The tick turns the button on. Nothing is stored here: the account is made on the hosted sign-in page, and the tick is recorded after it.
export function AccountForm() {
  const G = S.onb.signup;
  const [adult, setAdult] = useState(false);
  return (
    <div className="stack stack-5">
      <label className="check-row">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span className="stack stack-1">
          <span className="check-text">{G.adult}</span>
          <span className="caption">{G.adultNote}</span>
        </span>
      </label>
      <div className="stack stack-1">
        {adult ? (
          <a className="btn btn-primary btn-block" href="/sign-in">
            {G.send}
          </a>
        ) : (
          <button type="button" className="btn-primary btn-block" disabled>
            {G.send}
          </button>
        )}
        <p className="caption" style={{ textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap" }}>
          {G.have}{" "}
          <Link href="/sign-in" prefetch={false} className="btn btn-quiet">
            {G.signIn}
          </Link>
        </p>
      </div>
    </div>
  );
}
