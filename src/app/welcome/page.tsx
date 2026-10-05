import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { confirmAdult } from "./actions";
import { Narrow } from "../start/parts";

export const dynamic = "force-dynamic";

// "One quick thing". Shown only to a person who signed in without ticking the box on Create your account (or who has not accepted the CURRENT Terms): the
// same single box, unchecked, with no other choice beside it. "Terms" and "Privacy Notice" are links that open in a new tab (owner decision 6, 2026-10-04).
// Not designed in the handoff: tokens only.
export default async function Welcome({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/sign-in");
  if (session.status !== "needs_attestation") redirect("/");
  const { missing } = await searchParams;
  const G = S.onb.signup;

  return (
    <Narrow>
      <h1>One quick thing</h1>
      <form action={confirmAdult} className="stack stack-3">
        <label className="check-row">
          <input type="checkbox" name="accept" />
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
        {missing ? <p role="alert">Please tick the box to continue.</p> : null}
        <div>
          <button type="submit" className="btn-primary">
            Continue
          </button>
        </div>
      </form>
    </Narrow>
  );
}
