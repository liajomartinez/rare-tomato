import type { AgentView } from "@/lib/agents-view";
import { Health } from "./Health";
import { changeAccess, renameAgent, revokeAgent } from "./actions";

const SCOPE_LABEL: Record<string, string> = {
  "profile:basic": "Your preferences",
  "profile:contacts": "Your contacts",
  "profile:family": "Your family details",
  "rules:read": "Your rules",
  "tasks:write": "Record what it does",
};
const ALL_SCOPES = Object.keys(SCOPE_LABEL);

export function ChangeSettings({ a }: { a: AgentView }) {
  return (
    <details>
      <summary>Name, access and turning it off</summary>
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
            Turn this agent off
          </button>
        </form>
      </div>
    </details>
  );
}
