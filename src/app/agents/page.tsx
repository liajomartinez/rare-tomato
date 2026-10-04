import { agentsFor } from "@/db/production";
import { resourceUrl } from "@/lib/base-address";
import type { AgentView } from "@/lib/agents-view";
import { placementFor } from "@/lib/onboarding";
import { requireReady } from "@/lib/session";
import { UNASSIGNED_LIFETIME_DAYS } from "@/lib/connections";
import { RULES_SHORT_NOTE, S, unconfirmedAgentNote } from "@/lib/strings";
import { AgentAvatar, Banner, Nav, Notice, SignedInAs, Tag, WhoCanSee } from "../ui";
import { CopyBlock } from "../care-sheet/CopyButton";
import { Guides } from "./Guides";
import { Health } from "./Health";
import { MuseLimit, MuseTimedOut } from "./Muse";
import { NextStepText, SetupStatus, StarterSteps } from "./Setup";
import { changeAccess, confirmAgent, removeAgent, renameAgent, revokeAgent } from "./actions";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = { claude: "Claude", chatgpt: "ChatGPT", muse: "Muse", grok: "Grok Bot", other: "Another agent" };
const SCOPE_LABEL: Record<string, string> = {
  "profile:basic": "Your preferences",
  "profile:contacts": "Your contacts",
  "profile:family": "Your family details",
  "rules:read": "Your rules",
  "tasks:write": "Record what it does",
};
const ALL_SCOPES = Object.keys(SCOPE_LABEL);
const connectorAddress = () => resourceUrl();
/** Whole hours since Muse was last heard from, once that is 2 or more; otherwise null. Quiet is normal for an agent that is only called when asked. */
const QUIET_AFTER_HOURS = 2;
function quietHours(lastSeen: Date | null, now = new Date()): number | null {
  if (!lastSeen) return null;
  const h = Math.floor((now.getTime() - lastSeen.getTime()) / 3_600_000);
  return h >= QUIET_AFTER_HOURS ? h : null;
}
const shortWhen = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(",", "") + " UTC";

function ConfirmForm({ agent, existing }: { agent: AgentView; existing: AgentView[] }) {
  return (
    <form action={confirmAgent} className="stack stack-3">
      <input type="hidden" name="id" value={agent.id} />
      <div className="field">
        <label htmlFor={`type-${agent.id}`}>Which agent is this?</label>
        <select id={`type-${agent.id}`} name="type" defaultValue={agent.suggestedType ?? ""} required>
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`name-${agent.id}`}>What do you call it?</label>
        <input id={`name-${agent.id}`} name="name" required maxLength={60} placeholder="For example: Marge" />
      </div>
      {existing.length > 0 ? (
        <div className="field">
          <label htmlFor={`replace-${agent.id}`}>Is this the same agent reconnecting?</label>
          <select id={`replace-${agent.id}`} name="replaceId" defaultValue="">
            <option value="">No, this is a new agent</option>
            {existing.map((e) => (
              <option key={e.id} value={e.id}>
                This replaces my old {e.name} ({e.type ? TYPE_LABEL[e.type] : "agent"})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <fieldset>
        <legend>Also let it read (optional)</legend>
        <label>
          <input type="checkbox" name="extra" value="profile:contacts" /> Your contacts
        </label>
        <br />
        <label>
          <input type="checkbox" name="extra" value="profile:family" /> Your family details
        </label>
        <p className="caption">By default it can read your preferences and your rules, and record what it does.</p>
      </fieldset>
      <div>
        <button type="submit" className="btn-primary">
          Yes, this is my agent
        </button>
      </div>
    </form>
  );
}

function ChangeSettings({ a }: { a: AgentView }) {
  return (
    <details>
      <summary>Name, access and disconnect</summary>
      <div className="stack stack-3">
        <Health agent={a} />
        <form action={renameAgent} className="stack stack-3">
          <input type="hidden" name="id" value={a.id} />
          <div className="field">
            <label htmlFor={`rename-${a.id}`}>Name</label>
            <input id={`rename-${a.id}`} name="name" defaultValue={a.name} required maxLength={60} />
          </div>
          <div>
            <button type="submit" className="btn-sm">
              Save name
            </button>
          </div>
        </form>
        <form action={changeAccess} className="stack stack-3">
          <input type="hidden" name="id" value={a.id} />
          <fieldset>
            <legend>What it may read or do</legend>
            {ALL_SCOPES.map((s) => (
              <div key={s}>
                <label>
                  <input type="checkbox" name="scope" value={s} defaultChecked={a.scopes.includes(s)} /> {SCOPE_LABEL[s]}
                </label>
              </div>
            ))}
          </fieldset>
          <div>
            <button type="submit" className="btn-sm">
              Save access
            </button>
          </div>
        </form>
        <form action={revokeAgent}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn-sm">
            Disconnect this agent
          </button>
        </form>
      </div>
    </details>
  );
}

function AgentCard({ a }: { a: AgentView }) {
  const platform = a.type ? TYPE_LABEL[a.type] : "your agent";
  const place = placementFor(a.type);
  const muse = a.type === "muse";
  const working = a.setup.kind === "working";
  return (
    <article className="card card-roomy" aria-label={a.name}>
      <div className="row row-nowrap">
        <AgentAvatar name={a.name} />
        <div className="stack stack-0 grow">
          <b style={{ font: "var(--font-name-lg)" }}>{a.name}</b>
          <span className="caption">{platform}</span>
        </div>
        {muse ? <Tag strong>{S.muse.experimental}</Tag> : null}
      </div>
      <SetupStatus agent={a} />
      {muse ? (
        <MuseLimit quietHours={quietHours(a.lastSeenAt)} />
      ) : (
        <>
          <div className="next-box">
            <span className="eyebrow">{S.agents.nextStep}</span>
            <span className="strong-line">
              <NextStepText agent={a} platform={platform} />
            </span>
            {!working ? (
              <details className="btn-details" open={false}>
                <summary className="as-button btn-sm">{S.agents.showSteps}</summary>
                <div className="rule-above" style={{ marginTop: "var(--space-3)" }}>
                  <StarterSteps agent={a} platform={platform} />
                </div>
              </details>
            ) : null}
          </div>
          <div className="info">
            <p>{place.optional ? S.onb.setup.guides["Grok Bot"].intro : S.starter.limit}</p>
          </div>
        </>
      )}
      <ChangeSettings a={a} />
    </article>
  );
}

export default async function Agents({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const person = await requireReady();
  const { message } = await searchParams;
  const agents = await agentsFor(person.id).list();
  const waiting = agents.filter((a) => a.status === "unassigned");
  const expired = agents.filter((a) => a.status === "expired");
  const active = agents.filter((a) => a.status === "active");
  const revoked = agents.filter((a) => a.status === "revoked");
  const readers = active.filter((a) => a.scopes.includes("rules:read")).map((a) => a.name);
  const connectClass = waiting.length > 0 ? "btn" : "btn btn-primary";

  const sec = (heading: string, children: React.ReactNode) => (
    <section className="stack stack-3" aria-label={heading}>
      <h2>{heading}</h2>
      {children}
    </section>
  );

  const main = (
    <div className="stack stack-5">
      {waiting.length > 0
        ? sec(
            S.agents.waitingHeading,
            waiting.map((a) => (
              <section key={a.id} className="card card-ink card-roomy" aria-label="New agent">
                <p className="eyebrow">{S.agents.newEyebrow}</p>
                <h3>{a.suggestedType ? S.agents.looksLike(TYPE_LABEL[a.suggestedType]) : "New agent: which one is this?"}</h3>
                <p>{S.agents.newBody}</p>
                <p className="caption">{unconfirmedAgentNote(a.expiresAt ? shortWhen(a.expiresAt) : null, UNASSIGNED_LIFETIME_DAYS)}</p>
                <details>
                  <summary className="as-button btn-primary">{S.agents.check}</summary>
                  <div className="rule-above" style={{ marginTop: "var(--space-3)" }}>
                    <ConfirmForm agent={a} existing={[...active, ...revoked]} />
                  </div>
                </details>
              </section>
            )),
          )
        : null}

      {sec(
        S.agents.connectedHeading,
        active.length === 0 ? (
          <p className="caption">
            No agents are connected yet. After you add the address below in your agent, ask it to use the Rare Tomato tool once (for example: &ldquo;use the Rare
            Tomato hello tool&rdquo;). It will appear above so you can confirm it. After you confirm it, start a new chat in that agent.
          </p>
        ) : (
          <div className="stack">
            {active.map((a) => (
              <AgentCard key={a.id} a={a} />
            ))}
          </div>
        ),
      )}

      {expired.length > 0
        ? sec(
            S.agents.timedOutHeading,
            expired.map((a) =>
              a.suggestedType === "muse" ? (
                <MuseTimedOut key={a.id} id={a.id} removeAction={removeAgent} />
              ) : (
                <section key={a.id} className="card card-roomy">
                  <p>An agent signed in but was not confirmed in time, so it was turned off.</p>
                  <form action={removeAgent}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit">{S.agents.remove}</button>
                  </form>
                </section>
              ),
            ),
          )
        : null}

      {revoked.length > 0
        ? sec(
            S.agents.disconnectedHeading,
            revoked.map((a) => (
              <section key={a.id} className="card card-roomy">
                <p>{a.name} is disconnected and cannot get anything.</p>
                <p className="caption">{S.agents.disconnectedNote}</p>
                <form action={removeAgent}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit">{S.agents.remove}</button>
                </form>
              </section>
            )),
          )
        : null}

      <section id="connect" className="stack stack-3" aria-label={S.agents.connect}>
        <h2>{S.agents.connect}</h2>
        <p>
          Add this address as a custom connector or app in your agent (Claude, ChatGPT, Grok Bot, Muse or another). The agent will ask you to sign in. Then come
          back here and confirm it.
        </p>
        <CopyBlock value={connectorAddress()} buttonLabel="Copy address" copiedLabel={S.onb.connect.s1.copied} />
        <Guides address={connectorAddress()} />
      </section>
    </div>
  );

  const seeCard = (lines: readonly string[]) => (
    <div className="card card-quiet stack stack-3">
      <h3>{S.agents.seeTitle}</h3>
      {lines.map((s) => (
        <p key={s} style={{ margin: 0 }} className="caption">
          {s}
        </p>
      ))}
    </div>
  );

  return (
    <>
      <Nav current="agents" />
      <main className="page">
        <div className="stack stack-2">
          <h1>{S.agents.title}</h1>
          <p className="caption" style={{ maxWidth: "62ch" }}>
            {S.agents.intro}
          </p>
        </div>
        {message ? <Notice>{message}</Notice> : null}
        <div className="cols">
          {main}
          <aside className="stack">
            <div className="only-wide stack">{seeCard(S.agents.see)}</div>
            <WhoCanSee title={S.agents.whoTitle} agents={readers} note={S.agents.whoNote} />
            <a className={`${connectClass} btn-block`} href="#connect">
              {S.agents.connect}
            </a>
            <div className="hide-wide">{seeCard(S.agents.see.slice(0, 1))}</div>
            <Banner tone="info">{RULES_SHORT_NOTE}</Banner>
          </aside>
        </div>
        <SignedInAs email={person.email} />
      </main>
    </>
  );
}
