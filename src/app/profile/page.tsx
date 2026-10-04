import { agentsFor, profileFor } from "@/db/production";
import { whoCanSee, whoCanSeeFact } from "@/lib/agents-view";
import { CATEGORIES, type Category } from "@/lib/profile";
import { requireReady } from "@/lib/session";
import { AGENT_MEMORY_NOTE, NOT_END_TO_END, VISIBILITY_ALL, VISIBILITY_CHOSEN, VISIBILITY_NOTE } from "@/lib/strings";
import { button, card, muted, Nav, Notice, page } from "../ui";
import { deleteFact, reviewFact, setFactVisibility } from "./actions";
import { FactForm } from "./FactForm";

export const dynamic = "force-dynamic";

const TITLE: Record<Category, string> = { preferences: "Preferences", contacts: "Contacts", family: "Family" };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

export default async function Profile({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const person = await requireReady();
  const { message } = await searchParams;
  const [facts, agents] = await Promise.all([profileFor(person.id).list(), agentsFor(person.id).list()]);
  const seenBy = whoCanSee(agents);
  const connected = agents.filter((a) => a.status === "active");

  return (
    <main style={page}>
      <Nav />
      <h1>Your details</h1>
      {message ? <Notice>{message}</Notice> : null}
      <p>
        These stay in your account. Only the agents you have confirmed, and only the kinds of detail you allow them, can read them. {NOT_END_TO_END}
      </p>

      <section style={card} aria-label="Add a detail">
        <h2>Add a detail</h2>
        <FactForm defaults={{ category: "preferences", key: "", value: "" }} submitLabel="Add" />
      </section>

      {CATEGORIES.map((category) => {
        const items = facts.filter((f) => f.category === category);
        return (
          <section key={category} aria-label={TITLE[category]}>
            <h2>{TITLE[category]}</h2>
            <p style={muted}>
              Agents that can read this: {seenBy[category].length ? seenBy[category].join(", ") : "none right now"}
            </p>
            {items.length === 0 ? <p style={muted}>Nothing here yet.</p> : null}
            {items.map((f) => (
              <article key={f.id} style={card}>
                <h3>
                  {f.key}
                  {f.sensitive ? (
                    <span style={{ marginLeft: "0.5rem", border: "var(--border)", borderRadius: 0, padding: "0 0.4rem", fontSize: "0.8rem" }}>Sensitive</span>
                  ) : null}
                </h3>
                <p>{f.value}</p>
                {(() => {
                  const names = whoCanSeeFact(agents, f.category, f.allowedAgentIds);
                  return (
                    <p style={muted}>
                      Can be seen by: {names.length ? names.join(", ") : "no agent right now"}
                      {f.allowedAgentIds !== null ? " (limited to agents you chose)" : ""}
                    </p>
                  );
                })()}
                <p style={muted}>
                  Added {f.source === "manual" ? "by you" : f.source === "import" ? "from an import" : "from a correction"} · last checked {day(f.lastReviewedAt)}
                </p>
                <details open={f.sensitive && (f.allowedAgentIds === null || f.allowedAgentIds.length === 0)}>
                  <summary>Who can see this</summary>
                  <form action={setFactVisibility}>
                    <input type="hidden" name="id" value={f.id} />
                    <p>
                      <label>
                        <input type="radio" name="mode" value="all" defaultChecked={f.allowedAgentIds === null} /> {VISIBILITY_ALL}
                      </label>
                    </p>
                    <p>
                      <label>
                        <input type="radio" name="mode" value="chosen" defaultChecked={f.allowedAgentIds !== null} /> {VISIBILITY_CHOSEN}
                      </label>
                    </p>
                    {connected.length === 0 ? <p style={muted}>No agent is connected yet.</p> : null}
                    {connected.map((a) => (
                      <div key={a.id}>
                        <label>
                          <input type="checkbox" name="agent" value={a.id} defaultChecked={f.allowedAgentIds?.includes(a.id) ?? false} /> {a.name}
                          {a.scopes.includes(`profile:${f.category === "preferences" ? "basic" : f.category}`) ? "" : " (not allowed to read this kind of detail)"}
                        </label>
                      </div>
                    ))}
                    <p style={muted}>{VISIBILITY_NOTE}</p>
                    <button type="submit" style={button}>
                      Save who can see this
                    </button>
                  </form>
                </details>
                <details>
                  <summary>Edit</summary>
                  <FactForm defaults={{ id: f.id, category: f.category, key: f.key, value: f.value }} submitLabel="Save changes" />
                </details>
                <form action={reviewFact} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" style={button}>
                    Still correct
                  </button>
                </form>{" "}
                <form action={deleteFact} style={{ display: "inline" }}>
                  <input type="hidden" name="id" value={f.id} />
                  <button type="submit" style={button}>
                    Delete
                  </button>
                </form>
                <p style={muted}>{AGENT_MEMORY_NOTE}</p>
              </article>
            ))}
          </section>
        );
      })}
    </main>
  );
}
