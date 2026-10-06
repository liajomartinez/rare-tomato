import { agentsFor, profileFor } from "@/db/production";
import { whoCanSeeFact } from "@/lib/agents-view";
import { CATEGORIES, type Category } from "@/lib/profile";
import { requireReady } from "@/lib/session";
import { AGENT_MEMORY_NOTE, BLOCKED_CHECK_NOTE, NOT_END_TO_END, S, VISIBILITY_ALL, VISIBILITY_CHOSEN, VISIBILITY_NOTE } from "@/lib/strings";
import { BottomLink, Notice, PageSheet } from "../ui";
import { BackHeader, OnbPage } from "../start/onb";
import { deleteFact, reviewFact, setFactVisibility } from "./actions";
import { FactForm } from "./FactForm";

export const dynamic = "force-dynamic";

const TITLE: Record<Category, string> = { preferences: "Preferences", contacts: "Contacts", family: "Family" };
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "never");

// The Info half of Your Rules and Info: add a detail, then a plain list of what is saved. The back arrow sits in the header row. No cards.
export default async function Profile({ searchParams }: { searchParams: Promise<{ message?: string; sheet?: string }> }) {
  const person = await requireReady();
  const { message, sheet } = await searchParams;
  const [facts, agents] = await Promise.all([profileFor(person.id).list(), agentsFor(person.id).list()]);
  const connected = agents.filter((a) => a.status === "active");
  const filled = CATEGORIES.filter((c) => facts.some((f) => f.category === c));

  return (
    <>
      <OnbPage header={<BackHeader href="/rules" label={S.nav.rules}>{S.rules.title}</BackHeader>}>
        <p className="caption">{S.rules.subtext}</p>
        {message ? <Notice>{message}</Notice> : null}
        <FactForm defaults={{ category: "preferences", key: "", value: "" }} submitLabel="Add" showNote={false} />

        {facts.length === 0 ? <p className="plain-line">Nothing saved yet. Agents can read the details you add here.</p> : null}
        {filled.map((category) => (
          <section key={category} aria-label={TITLE[category]} className="flat">
            {filled.length > 1 ? <h2>{TITLE[category]}</h2> : null}
            {facts
              .filter((f) => f.category === category)
              .map((f) => {
                const names = whoCanSeeFact(agents, f.category, f.allowedAgentIds);
                return (
                  <article key={f.id} id={`fact-${f.id}`} className="flat-row stack stack-1">
                    <b>
                      {f.key}
                      {f.sensitive ? <span className="caption"> Sensitive</span> : null}
                    </b>
                    <span>{f.value}</span>
                    <span className="caption">
                      Can be seen by: {names.length ? names.join(", ") : "no agent right now"}
                      {f.allowedAgentIds !== null ? " (limited to agents you chose)" : ""} · last checked {day(f.lastReviewedAt)}
                    </span>
                    <details open={f.sensitive && (f.allowedAgentIds === null || f.allowedAgentIds.length === 0)}>
                      <summary>Who can see this</summary>
                      <form action={setFactVisibility} className="stack stack-2">
                        <input type="hidden" name="id" value={f.id} />
                        <label>
                          <input type="radio" name="mode" value="all" defaultChecked={f.allowedAgentIds === null} /> {VISIBILITY_ALL}
                        </label>
                        <label>
                          <input type="radio" name="mode" value="chosen" defaultChecked={f.allowedAgentIds !== null} /> {VISIBILITY_CHOSEN}
                        </label>
                        {connected.length === 0 ? <p className="caption">No agent is connected yet.</p> : null}
                        {connected.map((a) => (
                          <label key={a.id}>
                            <input type="checkbox" name="agent" value={a.id} defaultChecked={f.allowedAgentIds?.includes(a.id) ?? false} /> {a.name}
                            {a.scopes.includes(`profile:${f.category === "preferences" ? "basic" : f.category}`) ? "" : " (not allowed to read this kind of detail)"}
                          </label>
                        ))}
                        <p className="caption">{VISIBILITY_NOTE}</p>
                        <div>
                          <button type="submit" className="btn-sm">
                            Save who can see this
                          </button>
                        </div>
                      </form>
                    </details>
                    <details>
                      <summary>Edit</summary>
                      <FactForm defaults={{ id: f.id, category: f.category, key: f.key, value: f.value }} submitLabel="Save changes" />
                    </details>
                    <div className="row row-tight">
                      <form action={reviewFact}>
                        <input type="hidden" name="id" value={f.id} />
                        <button type="submit" className="btn-quiet pull-left">
                          Still correct
                        </button>
                      </form>
                      <form action={deleteFact}>
                        <input type="hidden" name="id" value={f.id} />
                        <button type="submit" className="btn-quiet">
                          Delete
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
          </section>
        ))}
        <BottomLink href="/profile?sheet=about">About your info</BottomLink>
      </OnbPage>
      {sheet === "about" ? (
        <PageSheet title="About your info" closeHref="/profile">
          <p className="caption">These stay in your account. Only the agents you have confirmed, and only the kinds of detail you allow them, can read them. {NOT_END_TO_END}</p>
          <p className="caption">{AGENT_MEMORY_NOTE}</p>
          <p className="caption">{BLOCKED_CHECK_NOTE}</p>
        </PageSheet>
      ) : null}
    </>
  );
}
