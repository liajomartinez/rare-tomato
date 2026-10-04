import { agentsFor } from "@/db/production";
import { resourceUrl } from "@/lib/base-address";
import type { AgentView } from "@/lib/agents-view";
import { requireReady } from "@/lib/session";
import { button, card, field, muted, Nav, Notice, page, SignedInAs } from "../ui";
import { UNASSIGNED_LIFETIME_DAYS } from "@/lib/connections";
import { RULES_SHORT_NOTE, unconfirmedAgentNote } from "@/lib/strings";
import { Guides } from "./Guides";
import { Health } from "./Health";
import { MuseLimit, MuseTimedOut } from "./Muse";
import { Setup } from "./Setup";
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
const when = (d: Date | null) => (d ? d.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "not yet");

function ConfirmForm({ agent, existing }: { agent: AgentView; existing: AgentView[] }) {
  return (
    <form action={confirmAgent}>
      <input type="hidden" name="id" value={agent.id} />
      <label>
        Which agent is this?
        <select name="type" defaultValue={agent.suggestedType ?? ""} required style={field}>
          <option value="" disabled>
            Choose one
          </option>
          {Object.entries(TYPE_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        What do you call it?
        <input name="name" required maxLength={60} placeholder="For example: Marge" style={field} />
      </label>
      {existing.length > 0 ? (
        <label>
          Is this the same agent reconnecting?
          <select name="replaceId" defaultValue="" style={field}>
            <option value="">No, this is a new agent</option>
            {existing.map((e) => (
              <option key={e.id} value={e.id}>
                This replaces my old {e.name} ({e.type ? TYPE_LABEL[e.type] : "agent"})
              </option>
            ))}
          </select>
        </label>
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
        <p style={muted}>By default it can read your preferences and your rules, and record what it does.</p>
      </fieldset>
      <button type="submit" style={button}>
        Yes, this is my agent
      </button>
    </form>
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

  return (
    <main style={page}>
      <Nav />
      <h1>Your agents</h1>
      <SignedInAs email={person.email} />
      {message ? <Notice>{message}</Notice> : null}

      <h2>New agents waiting for you</h2>
      {waiting.length === 0 ? <p style={muted}>Nothing waiting.</p> : null}
      {waiting.map((a) => (
        <section key={a.id} style={card} aria-label="New agent">
          <h3>{a.suggestedType ? `Looks like ${TYPE_LABEL[a.suggestedType]}` : "New agent: which one is this?"}</h3>
          <p>
            It signed in, but you have not confirmed it yet. Until you do, it can only say hello. It cannot see any of your details.
            {" "}
            {unconfirmedAgentNote(a.expiresAt ? when(a.expiresAt) : null, UNASSIGNED_LIFETIME_DAYS)}
          </p>
          <ConfirmForm agent={a} existing={[...active, ...revoked]} />
        </section>
      ))}

      <h2>Your connected agents</h2>
      {active.length === 0 ? (
        <p style={muted}>
          No agents are connected yet. After you add the address below in your agent, ask it to use the Rare Tomato tool once (for example: &ldquo;use the Rare
          Tomato hello tool&rdquo;). It will appear above so you can confirm it. After you confirm it, start a new chat in that agent.
        </p>
      ) : null}
      {active.map((a) => (
        <section key={a.id} style={card} aria-label={a.name}>
          <h3>
            {a.name} <span style={muted}>({a.type ? TYPE_LABEL[a.type] : "unknown"}, connected)</span>
          </h3>
          <Setup agent={a} typeLabel={a.type ? TYPE_LABEL[a.type] : "your agent"} />
          <Health agent={a} />
          {a.type === "muse" ? <MuseLimit quietHours={quietHours(a.lastSeenAt)} /> : null}
          <form action={renameAgent}>
            <input type="hidden" name="id" value={a.id} />
            <label>
              Name
              <input name="name" defaultValue={a.name} required maxLength={60} style={field} />
            </label>
            <button type="submit" style={button}>
              Save name
            </button>
          </form>
          <form action={changeAccess}>
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
            <button type="submit" style={button}>
              Save access
            </button>
          </form>
          <form action={revokeAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" style={button}>
              Disconnect this agent
            </button>
          </form>
        </section>
      ))}

      {expired.length > 0 ? <h2>Timed out</h2> : null}
      {expired.map((a) =>
        a.suggestedType === "muse" ? (
          <MuseTimedOut key={a.id} id={a.id} removeAction={removeAgent} />
        ) : (
        <section key={a.id} style={card}>
          <p>An agent signed in but was not confirmed in time, so it was turned off.</p>
          <form action={removeAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" style={button}>
              Remove it
            </button>
          </form>
        </section>
        ),
      )}

      {revoked.length > 0 ? <h2>Disconnected</h2> : null}
      {revoked.map((a) => (
        <section key={a.id} style={card}>
          <p>{a.name} is disconnected and cannot get anything.</p>
          <form action={removeAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" style={button}>
              Remove it from this list
            </button>
          </form>
        </section>
      ))}

      <h2>Connect another agent</h2>
      <p>
        Add this address as a custom connector or app in your agent (Claude, ChatGPT, Grok Bot, Muse or another). The agent will ask you to sign in.
        Then come back here and confirm it.
      </p>
      <p>
        <code>{connectorAddress()}</code>
      </p>
      <Guides address={connectorAddress()} />
      <p style={muted}>{RULES_SHORT_NOTE}</p>
    </main>
  );
}
