import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/session";
import { ACCEPT_LABEL, PRIVACY_NOTICE_NOTICE } from "@/lib/strings";
import { confirmAdult } from "./actions";

export const dynamic = "force-dynamic";

// "One quick thing". Shown before anything else to a person who has not confirmed they are an adult and accepted the CURRENT Terms.
// Above the box is a plain notice about the Privacy Notice (it is a notice, not a consent box). One box, unchecked, with no other choice beside it.
export default async function Welcome({ searchParams }: { searchParams: Promise<{ missing?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/sign-in");
  if (session.status !== "needs_attestation") redirect("/");
  const { missing } = await searchParams;
  const [before, after] = PRIVACY_NOTICE_NOTICE.split("Privacy Notice");

  return (
    <main style={{ maxWidth: 520, margin: "4rem auto", padding: "0 1rem", fontFamily: "system-ui, sans-serif" }}>
      <h1>One quick thing</h1>
      <p>
        {before}
        <Link href="/privacy" target="_blank" rel="noopener" prefetch={false}>
          Privacy Notice
        </Link>
        {after}
      </p>
      <form action={confirmAdult}>
        <label style={{ display: "block", minHeight: 44 }}>
          <input type="checkbox" name="accept" /> {ACCEPT_LABEL}
        </label>
        <p style={{ fontSize: "0.9rem" }}>
          <Link href="/terms" target="_blank" rel="noopener" prefetch={false}>
            Read the Terms
          </Link>{" "}
          (opens in a new tab).
        </p>
        {missing ? <p role="alert">Please tick the box to continue.</p> : null}
        <p>
          <button type="submit" style={{ minHeight: 44, padding: "0.5rem 1rem", font: "inherit" }}>
            Continue
          </button>
        </p>
      </form>
    </main>
  );
}
