import { dataFor } from "@/db/production";
import { requireReady } from "@/lib/session";
import { button, card, field, muted, Nav, Notice, page } from "../ui";
import { InstallCard } from "../InstallCard";
import { DELETE_PHRASE } from "@/lib/strings";
import { deleteMyAccount } from "./actions";

export const dynamic = "force-dynamic";

export default async function SettingsAndData({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const person = await requireReady();
  const { message } = await searchParams;
  const entries = await dataFor(person.id).audit(50);

  return (
    <main style={page}>
      <Nav />
      <h1>Settings and data</h1>
      {message ? <Notice>{message}</Notice> : null}

      <InstallCard eligible alwaysAvailable />

      <section style={card} aria-label="Download your data">
        <h2>Download my data</h2>
        <p>One file with everything we hold about you, in readable form: your details, rules, task records, feedback, your agents and the audit log.</p>
        <p>
          <a href="/data/export" style={{ ...button, display: "inline-block", lineHeight: "44px", padding: "0 1rem" }}>
            Download my data (JSON)
          </a>
        </p>
        <p style={muted}>Task records and scores in this file are agent-reported. Agents may also keep what they read in their own memory; that is not in this file.</p>
      </section>

      <section style={card} aria-label="Audit log">
        <h2>What your agents asked for</h2>
        <p style={muted}>
          This shows when a request from an agent reached us and which kinds of information we answered with. It never shows the information itself, and it
          does not show whether an agent used or followed what it received.
        </p>
        {entries.length === 0 ? <p>Nothing yet.</p> : null}
        <ul>
          {entries.map((e, i) => (
            <li key={i}>
              {e.at.toISOString().slice(0, 16).replace("T", " ")} UTC · <strong>{e.who}</strong> {e.action}
              {e.categories.length ? ` (${e.categories.join(", ")})` : ""}
            </li>
          ))}
        </ul>
        <p>
          <a href="/data/audit">Download the full audit log (JSON)</a>
        </p>
      </section>

      <section style={card} aria-label="Delete your account">
        <h2>Delete my account</h2>
        <p>
          This removes your account and everything in it from our database straight away: your details, rules, task records, feedback, scores, connections and
          audit log. It cannot be undone, so download your data first if you want a copy.
        </p>
        <ul>
          <li>Agents may keep what they read in their own memory. Deleting here does not delete those copies.</li>
          <li>Our database provider keeps recovery copies that age out on its own schedule. We are confirming how long, and this page will say when we know.</li>
          <li>We also ask our sign-in provider to remove your sign-in record. If you sign in again later, you start with an empty account.</li>
        </ul>
        <form action={deleteMyAccount}>
          <label>
            To confirm, type {DELETE_PHRASE}
            <input name="confirm" autoComplete="off" style={field} />
          </label>
          <button type="submit" style={button}>
            Delete my account
          </button>
        </form>
      </section>

      <p style={muted}>
        <a href="/privacy">What we store, who processes it, and what we try not to store</a>
      </p>
    </main>
  );
}
