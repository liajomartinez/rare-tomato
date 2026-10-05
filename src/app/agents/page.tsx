import Link from "next/link";
import { agentsFor } from "@/db/production";
import type { AgentView } from "@/lib/agents-view";
import { attentionOf } from "@/lib/attention";
import { needsFinishSetup } from "@/lib/onboarding";
import { isGuided, shortDate, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { finishBody, messageBody, NO_CALLS_YET, S, TIMED_OUT_BODY } from "@/lib/strings";
import { AgentAvatar, Nav, Notice, SignedInAs, StatusIcon, Tag, WhoCanSee } from "../ui";
import { Health } from "./Health";
import { changeAccess, reconnectAgent, removeAgent, renameAgent, revokeAgent } from "./actions";

export const dynamic = "force-dynamic";

// Your agents (SPEC B4), grouped by what the person has to do: Needs attention (waiting for a confirmation, setup not finished, connection timed out),
// Connected, Disconnected (compact rows). The first Needs-attention card holds the one primary button. Empty sections are hidden. No tutorials inside
// cards: Confirm and Finish setup each open a focused screen. Every date comes from OUR OWN records and never means an agent followed a rule.

const SCOPE_LABEL: Record<string, string> = {
  "profile:basic": "Your preferences",
  "profile:contacts": "Your contacts",
  "profile:family": "Your family details",
  "rules:read": "Your rules",
  "tasks:write": "Record what it does",
};
const ALL_SCOPES = Object.keys(SCOPE_LABEL);

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

/** One card in Needs attention: avatar, name, a status line with an icon, one sentence, one button. */
function AttentionCard({
  name, platform, experimental, status, icon, body, button,
}: {
  name: string;
  platform?: string;
  experimental?: boolean;
  status: string;
  icon: "outline" | "alert";
  body: string;
  button: React.ReactNode;
}) {
  return (
    <article className="card card-roomy" aria-label={name}>
      <div className="row row-nowrap">
        <AgentAvatar name={name} />
        <div className="stack stack-0 grow">
          <b style={{ font: "var(--font-name-lg)" }}>{name}</b>
          {platform ? <span className="caption">{platform}</span> : null}
        </div>
        {experimental ? <Tag strong>{S.agents.experimental}</Tag> : null}
      </div>
      <div className="status-line" role="status">
        <StatusIcon kind={icon} />
        <b>{status}</b>
      </div>
      <p className="caption">{body}</p>
      {button}
    </article>
  );
}

export default async function Agents({ searchParams }: { searchParams: Promise<{ message?: string }> }) {
  const person = await requireReady();
  const { message } = await searchParams;
  const agents = await agentsFor(person.id).list();
  const attention = attentionOf(agents);
  const active = agents.filter((a) => a.status === "active");
  const revoked = agents.filter((a) => a.status === "revoked");
  const readers = active.filter((a) => a.scopes.includes("rules:read")).map((a) => a.name);
  const connected = active.filter((a) => !needsFinishSetup(a));
  // The first Needs-attention card holds the one primary button on the screen; with nothing to attend to, "Connect an agent" is the primary.
  const btnClass = (i: number) => `btn-block${i === 0 ? " btn-primary" : ""}`;

  // Needs attention: confirmations first, then setup not finished, then timed out.
  let i = 0;
  const cards: React.ReactNode[] = [];
  for (const a of attention.confirm) {
    const platform = a.suggestedType ? TYPE_LABEL[a.suggestedType] : null;
    cards.push(
      <AttentionCard
        key={a.id}
        name={platform ?? "New agent"}
        status={S.agents.needsConfirm}
        icon="outline"
        body={S.agents.waitingBody}
        button={
          <Link href={`/agents/confirm?agent=${a.id}`} prefetch={false} className={`btn ${btnClass(i++)}`}>
            {S.agents.confirm(platform ?? "agent")}
          </Link>
        }
      />,
    );
  }
  for (const a of attention.finish) {
    const platform = a.type ? TYPE_LABEL[a.type] : "";
    const guided = isGuided(a.type);
    cards.push(
      <AttentionCard
        key={a.id}
        name={a.name}
        platform={platform}
        experimental={a.type === "muse"}
        status={guided ? S.agents.setupNot : S.agents.finishSetup}
        icon="outline"
        body={guided ? finishBody(platform, a.name) : messageBody(a.name)}
        button={
          <Link href={`/agents/finish?agent=${a.id}`} prefetch={false} className={`btn ${btnClass(i++)}`}>
            {S.agents.finishSetup}
          </Link>
        }
      />,
    );
  }
  for (const a of attention.timedOut) {
    const platform = a.suggestedType ? TYPE_LABEL[a.suggestedType] : null;
    cards.push(
      <AttentionCard
        key={a.id}
        name={platform ?? "An agent"}
        status={S.agents.timedOut}
        icon="alert"
        body={TIMED_OUT_BODY}
        button={
          <form action={reconnectAgent}>
            <input type="hidden" name="id" value={a.id} />
            <button type="submit" className={btnClass(i++)}>
              {S.agents.reconnect}
            </button>
          </form>
        }
      />,
    );
  }

  const sec = (heading: string, children: React.ReactNode) => (
    <section className="stack stack-3" aria-label={heading}>
      <h2>{heading}</h2>
      {children}
    </section>
  );

  const main = (
    <div className="stack stack-5">
      {cards.length > 0 ? sec(S.agents.attention, <div className="stack">{cards}</div>) : null}

      {connected.length > 0
        ? sec(
            S.agents.connected,
            <div className="stack">
              {connected.map((a) => {
                const platform = a.type ? TYPE_LABEL[a.type] : "your agent";
                const muse = a.type === "muse";
                return (
                  <article key={a.id} className="card card-roomy" aria-label={a.name}>
                    <div className="row row-nowrap">
                      <AgentAvatar name={a.name} />
                      <div className="stack stack-0 grow">
                        <b style={{ font: "var(--font-name-lg)" }}>{a.name}</b>
                        <span className="caption">{platform}</span>
                      </div>
                      {muse ? <Tag strong>{S.agents.experimental}</Tag> : null}
                    </div>
                    {a.setup.kind === "working" ? (
                      <>
                        <div className="status-line" role="status">
                          <StatusIcon kind="check" />
                          <b>{S.agents.working}</b>
                        </div>
                        <p className="caption">{S.agents.lastChecked(shortDate(a.setup.at))}</p>
                      </>
                    ) : (
                      <p className="caption">{NO_CALLS_YET}</p>
                    )}
                    {muse ? (
                      <div className="stack stack-2">
                        <p className="caption">{S.agents.museNote}</p>
                        <Link href="/start/setup?agent=muse&again=1" prefetch={false} className="btn btn-block">
                          {S.agents.reconnect}
                        </Link>
                      </div>
                    ) : null}
                    <ChangeSettings a={a} />
                  </article>
                );
              })}
            </div>,
          )
        : null}

      {revoked.length > 0
        ? sec(
            S.agents.disconnected,
            <div className="stack stack-2">
              {revoked.map((a) => (
                <div key={a.id} className="row row-between row-nowrap rule-row-compact">
                  <div className="row row-nowrap">
                    <AgentAvatar name={a.name} size="sm" />
                    <span style={{ font: "var(--font-name)" }}>
                      {a.name} {"·"} {S.agents.disconnected}
                    </span>
                  </div>
                  <form action={removeAgent}>
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className="btn-quiet">
                      {S.agents.remove}
                    </button>
                  </form>
                </div>
              ))}
              <p className="caption">{S.agents.removeNote}</p>
            </div>,
          )
        : null}

      {agents.length === 0 ? <p className="caption">No agents yet. Connect one to get started.</p> : null}
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
            <Link href="/start/agents" prefetch={false} className={`btn btn-block${attention.count === 0 ? " btn-primary" : ""}`}>
              {S.agents.connect}
            </Link>
            <div className="hide-wide">{seeCard(S.agents.see)}</div>
          </aside>
        </div>
        <SignedInAs email={person.email} />
      </main>
    </>
  );
}
