import Link from "next/link";
import { agentsFor } from "@/db/production";
import { attentionOf } from "@/lib/attention";
import { needsFinishSetup } from "@/lib/onboarding";
import { shortDate, TYPE_LABEL } from "@/lib/platforms";
import { requireReady } from "@/lib/session";
import { finishBody, messageBody, S } from "@/lib/strings";
import { AgentLabel, BottomLink, Nav, Notice, PageSheet } from "../ui";
import { ExpiredCard } from "./ExpiredCard";

export const dynamic = "force-dynamic";

// Connected Agents (round 12): plain rows with the name and a small gray status. An agent that needs something (to be confirmed, to finish setup, or expired)
// comes first with one button. What each agent can read lives on its own page. The explanation is one small link at the bottom that opens a sheet.
// Every date comes from OUR OWN records and never means an agent followed a rule.

export default async function Agents({ searchParams }: { searchParams: Promise<{ message?: string; sheet?: string }> }) {
  const person = await requireReady();
  const { message, sheet } = await searchParams;
  const agents = await agentsFor(person.id).list();
  const attention = attentionOf(agents);
  const active = agents.filter((a) => a.status === "active");
  const connected = active.filter((a) => !needsFinishSetup(a));
  // The first row that needs something holds the one primary button; with nothing to attend to, "Connect an agent" is the primary.
  let i = 0;
  const btn = () => `btn btn-block${i++ === 0 ? " btn-primary" : ""}`;

  const needs: React.ReactNode[] = [];
  for (const a of attention.confirm) {
    const platform = a.suggestedType ? TYPE_LABEL[a.suggestedType] : "agent";
    needs.push(
      <article key={a.id} className="flat-row stack stack-2" aria-label={platform}>
        <div className="stack stack-0">
          <b>{platform}</b>
          <span className="caption">{S.agents.needsConfirm}</span>
        </div>
        <Link href={`/agents/confirm?agent=${a.id}`} prefetch={false} className={btn()}>
          {S.agents.confirm(platform)}
        </Link>
      </article>,
    );
  }
  for (const a of attention.finish) {
    const platform = a.type ? TYPE_LABEL[a.type] : "";
    needs.push(
      <article key={a.id} className="flat-row stack stack-2" aria-label={a.name}>
        <div className="stack stack-0">
          <span>
            <AgentLabel name={a.name} type={platform} />
          </span>
          <span className="caption">{a.type === "claude" || a.type === "chatgpt" ? finishBody(platform, a.name) : messageBody(a.name)}</span>
        </div>
        <Link href={`/agents/finish?agent=${a.id}`} prefetch={false} className={btn()}>
          {S.agents.finishSetup}
        </Link>
      </article>,
    );
  }
  for (const a of attention.timedOut) needs.push(<ExpiredCard key={a.id} agent={a} primary={i++ === 0} />);

  const both = needs.length > 0 && connected.length > 0;
  return (
    <>
      <Nav current="agents" />
      <main className="page-flat">
        <h1>{S.agents.title}</h1>
        {message ? <Notice>{message}</Notice> : null}

        {needs.length > 0 ? (
          <section className="flat" aria-label={S.agents.attention}>
            {both ? <h2>{S.agents.attention}</h2> : null}
            {needs}
          </section>
        ) : null}

        {connected.length > 0 ? (
          <section className="flat" aria-label={S.agents.connected}>
            {both ? <h2>{S.agents.connected}</h2> : null}
            {connected.map((a) => (
              <Link key={a.id} href={`/agents/view?agent=${a.id}`} prefetch={false} className="flat-row stack stack-0" style={{ color: "var(--text-body)", textDecoration: "none" }}>
                <span>
                  <AgentLabel name={a.name} type={a.type ? TYPE_LABEL[a.type] : null} />
                  {a.type === "muse" ? <span className="caption"> {S.agents.experimental}</span> : null}
                </span>
                <span className="caption">
                  {a.setup.kind === "working" ? `${S.agents.working}. ${S.agents.lastChecked(shortDate(a.setup.at))}` : S.agents.connected}
                </span>
              </Link>
            ))}
          </section>
        ) : null}

        {agents.length === 0 ? <p className="plain-line">No agents yet.</p> : null}

        <Link href="/start/agents" prefetch={false} className={`btn btn-block${needs.length === 0 ? " btn-primary" : " btn-quiet"}`}>
          {S.agents.connect}
        </Link>
        <BottomLink href="/agents?sheet=see">{S.agents.seeTitle}</BottomLink>
      </main>
      {sheet === "see" ? (
        <PageSheet title={S.agents.seeTitle} closeHref="/agents">
          {S.agents.see.map((t) => (
            <p key={t} className="caption">
              {t}
            </p>
          ))}
          <p className="caption">{S.agents.intro}</p>
        </PageSheet>
      ) : null}
    </>
  );
}

