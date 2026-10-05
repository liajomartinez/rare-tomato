import type { AgentView } from "@/lib/agents-view";
import { TYPE_LABEL } from "@/lib/platforms";
import type { AgentType } from "@/lib/connections";
import { confirmAgent } from "./actions";

// Confirm and name a new agent that has signed in (owner decision 11: "after a new agent signs in, there is a confirm-and-name step before it can use
// anything"). Until this is submitted the agent has no permissions at all. It asks which agent this is, what you call it, whether it replaces an old
// agent of the same kind, and which extra details it may read. By default it can read your preferences and your rules, and record what it does.

export function ConfirmForm({
  agent,
  existing,
  next,
  button,
  expected,
}: {
  agent: AgentView;
  /** The person's other agents; those of the chosen kind can be replaced. */
  existing: AgentView[];
  /** Where to go after confirming (an address inside this app). */
  next?: string;
  /** The text on the primary button. */
  button: string;
  /** The kind of agent we expect this to be (from the screen the person came from), when known. */
  expected?: AgentType | null;
}) {
  const type = expected ?? agent.suggestedType ?? "";
  const sameKind = existing.filter((e) => e.type === type && e.status !== "unassigned" && e.status !== "expired");
  return (
    <form action={confirmAgent} className="stack stack-3">
      <input type="hidden" name="id" value={agent.id} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="field">
        <label htmlFor={`type-${agent.id}`}>Which agent is this?</label>
        <select id={`type-${agent.id}`} name="type" defaultValue={type} required>
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
        <input id={`name-${agent.id}`} name="name" required maxLength={60} placeholder="For example: Marge" defaultValue={type ? TYPE_LABEL[type] : ""} />
      </div>
      {existing.filter((e) => e.status !== "unassigned" && e.status !== "expired").length > 0 ? (
        <div className="field">
          <label htmlFor={`replace-${agent.id}`}>Is this the same agent reconnecting?</label>
          <select id={`replace-${agent.id}`} name="replaceId" defaultValue={sameKind[0]?.id ?? ""}>
            <option value="">No, this is a new agent</option>
            {existing
              .filter((e) => e.status !== "unassigned" && e.status !== "expired")
              .map((e) => (
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
      <button type="submit" className="btn-primary btn-block">
        {button}
      </button>
    </form>
  );
}
