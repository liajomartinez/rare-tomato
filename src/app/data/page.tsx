import Link from "next/link";
import { dataFor } from "@/db/production";
import { requireReady } from "@/lib/session";
import { DELETE_PHRASE, S } from "@/lib/strings";
import { InstallCard } from "../InstallCard";
import { BackHeader, OnbPage } from "../start/onb";
import { Notice, SignedInAs } from "../ui";
import { deleteMyAccount } from "./actions";

export const dynamic = "force-dynamic";

// Settings and data (round 12): flat sections, no cards. This is where "Signed in as" and the Privacy and Terms links live (never in page bodies).
export default async function SettingsAndData({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const person = await requireReady();
  const { message } = await searchParams;
  const entries = await dataFor(person.id).audit(50);

  return (
    <OnbPage header={<BackHeader href="/" label={S.nav.home}>{S.nav.settings}</BackHeader>}>
      {message ? <Notice>{message}</Notice> : null}
      <SignedInAs email={person.email} />

      <InstallCard eligible alwaysAvailable />

      <section className="stack stack-2" aria-label="Download your data">
        <h2>Download my data</h2>
        <p>One file with everything we hold about you, in readable form: your saved details, rules, task records, feedback, your agents and the audit log.</p>
        <a href="/data/export" className="btn btn-primary btn-block">
          Download my data (JSON)
        </a>
        <p className="caption">Task records and scores in this file are agent-reported. Agents may also keep what they read in their own memory; that is not in this file.</p>
      </section>

      <section className="stack stack-2" aria-label="Audit log">
        <h2>What your agents asked for</h2>
        <p className="caption">
          This shows when a request from an agent reached us and which kinds of information we answered with. It never shows the information itself, and it
          does not show whether an agent used or followed what it received.
        </p>
        {entries.length === 0 ? <p>Nothing yet.</p> : null}
        <div className="flat">
          {entries.map((e, i) => (
            <p key={i} className="flat-row caption" style={{ margin: 0 }}>
              {e.at.toISOString().slice(0, 16).replace("T", " ")} UTC · <strong>{e.who}</strong> {e.action}
              {e.categories.length ? ` (${e.categories.join(", ")})` : ""}
            </p>
          ))}
        </div>
        <a className="link-sm" href="/data/audit">
          Download the full audit log (JSON)
        </a>
      </section>

      <section className="stack stack-2" aria-label="Delete your account">
        <h2>Delete my account</h2>
        <p>
          This removes your account and everything in it from our database straight away: your saved details, rules, task records, feedback, scores, connections and
          audit log. It cannot be undone, so download your data first if you want a copy.
        </p>
        <ul>
          <li>Agents may keep what they read in their own memory. Deleting here does not delete those copies.</li>
          <li>Our database provider keeps recovery copies that age out on its own schedule. We are confirming how long, and this page will say when we know.</li>
          <li>We also ask our sign-in provider to remove your sign-in record. If you sign in again later, you start with an empty account.</li>
        </ul>
        <form action={deleteMyAccount} className="stack stack-2">
          <label>
            To confirm, type {DELETE_PHRASE}
            <input name="confirm" autoComplete="off" />
          </label>
          <button type="submit">Delete my account</button>
        </form>
      </section>

      <p className="bottom-links">
        <Link href="/privacy" prefetch={false} className="link-sm">
          Privacy
        </Link>
        <Link href="/terms" prefetch={false} className="link-sm">
          Terms
        </Link>
      </p>
    </OnbPage>
  );
}
