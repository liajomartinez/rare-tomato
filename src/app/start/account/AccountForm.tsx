"use client";

import Link from "next/link";
import { useState } from "react";
import { S, SIGN_UP_CONTINUE } from "@/lib/strings";
import { agreeAndSignIn } from "../actions";

// One checkbox: "I am 18 or older and agree to the Terms and Privacy Notice." (owner decision 6). The button stays off until it is ticked. The tick is
// recorded, with the time, right after sign-in (see src/lib/terms-cookie.ts). The account itself is made on the hosted sign-in page.
export function AccountForm() {
  const G = S.onb.signup;
  const [agreed, setAgreed] = useState(false);
  return (
    <form action={agreeAndSignIn} className="stack stack-5">
      <label className="check-row">
        <input type="checkbox" name="accept" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span className="check-text">
          {G.agree[0]}
          <Link href="/terms" target="_blank" rel="noopener" prefetch={false} className="strong-link">
            {G.terms}
          </Link>
          {G.agree[1]}
          <Link href="/privacy" target="_blank" rel="noopener" prefetch={false} className="strong-link">
            {G.privacy}
          </Link>
          {G.agree[2]}
        </span>
      </label>
      <div className="stack stack-1">
        <button type="submit" className="btn-primary btn-block" disabled={!agreed}>
          {SIGN_UP_CONTINUE}
        </button>
        <p className="caption" style={{ textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", gap: "var(--space-1)", flexWrap: "wrap" }}>
          {G.have}{" "}
          <Link href="/sign-in" prefetch={false} className="btn btn-quiet">
            {G.signIn}
          </Link>
        </p>
      </div>
    </form>
  );
}
