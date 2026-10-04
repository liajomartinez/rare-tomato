import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { agentsFor } from "@/db/production";
import { GUIDES } from "@/lib/agent-guides";
import { resourceUrl } from "@/lib/base-address";
import { claudeAddLink, claudeTestLink, flowAgent, nextPicked, parsePicked, PICKED_COOKIE } from "@/lib/onboarding-flow";
import { currentSession } from "@/lib/session";
import { S } from "@/lib/strings";
import { CopyBlock, CopyButton } from "../../care-sheet/CopyButton";
import { StatusIcon } from "../../ui";
import { doThisLater } from "../actions";
import { ExternalThenGo } from "../ExternalThenGo";
import { BackLink, Narrow } from "../parts";

export const dynamic = "force-dynamic";

// Connect, one step per screen (SPEC A5). For Claude: 1 open Claude (its documented link fills in the name and address), 2 add and sign in, 3 we look for
// it, 4 a test message (only if it did not show up). ChatGPT, Grok Bot and Muse have no prefilled link, so they get their existing connection steps
// and a copy button (not designed in the handoff: restyled only). "Looking for it" checks our own records every time the page is opened.
export default async function Connect({ searchParams }: { searchParams: Promise<{ agent?: string; step?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status === "needs_attestation") redirect("/welcome");
  if (session.status !== "ready") redirect("/");
  const q = await searchParams;
  const agent = flowAgent(q.agent);
  if (!agent) redirect("/start/agents");
  const step = Math.min(Math.max(Number.parseInt(q.step ?? "1", 10) || 1, 1), 4);
  const C = S.onb.connect;
  const address = resourceUrl();
  const picked = parsePicked((await cookies()).get(PICKED_COOKIE)?.value);
  const following = nextPicked(picked, agent.key);
  const live = agent.key === "claude";
  const here = (n: number) => `/start/connect?agent=${agent.key}&step=${n}`;

  // Steps 3 and 4 look at our records. A signed-in agent that is not confirmed yet goes on to "is connected"; one already confirmed goes to Try it.
  if (step >= 3) {
    const agents = await agentsFor(session.person.id).list();
    const waiting = agents.some((a) => a.status === "unassigned" && (a.suggestedType === agent.type || a.suggestedType === null));
    if (waiting) redirect(`/start/arrived?agent=${agent.key}`);
    if (step === 3 && agents.some((a) => a.status === "active" && a.type === agent.type)) redirect(`/start/try?agent=${agent.key}`);
  }

  const guide = GUIDES.find((g) => g.id === agent.key);
  const n = Math.min(step, 3) + 1;
  const title = (t: string, text?: string): ReactNode => (
    <div className="stack stack-3">
      <h1>{t}</h1>
      {text ? <p className="lead">{text}</p> : null}
    </div>
  );

  let body: ReactNode;
  if (step === 1 && live) {
    body = (
      <>
        {title(C.s1.title(agent.name), C.s1.body(agent.name))}
        <div className="stack stack-1">
          <ExternalThenGo href={claudeAddLink(address)} next={here(2)}>
            {C.s1.button(agent.name)}
          </ExternalThenGo>
          <details>
            <summary style={{ justifyContent: "center" }}>{C.s1.copyInstead}</summary>
            <CopyBlock value={address} buttonLabel={C.s1.copy} copiedLabel={C.s1.copied} />
          </details>
        </div>
      </>
    );
  } else if (step === 1) {
    body = (
      <>
        {title(`Connect ${agent.name}`)}
        {guide ? (
          <ol className="steps">
            {guide.steps.map((s) => (
              <li key={s}>
                <span className="step-text">{s}</span>
              </li>
            ))}
          </ol>
        ) : null}
        <CopyBlock value={address} buttonLabel={C.s1.copy} copiedLabel={C.s1.copied} />
        <Link href={here(3)} prefetch={false} className="btn btn-primary btn-block">
          {C.s2.button}
        </Link>
      </>
    );
  } else if (step === 2) {
    body = (
      <>
        {title(C.s2.title, C.s2.body(agent.name))}
        <Link href={here(3)} prefetch={false} className="btn btn-primary btn-block">
          {C.s2.button}
        </Link>
      </>
    );
  } else if (step === 3) {
    body = (
      <>
        {title(C.s3.title(agent.name), C.s3.body)}
        <div className="row row-nowrap" role="status">
          <StatusIcon kind="outline" />
          <b style={{ font: "var(--font-status)" }}>{C.s3.status(agent.name)}</b>
        </div>
        <div className="stack stack-1">
          <Link href={here(3)} prefetch={false} className="btn btn-primary btn-block">
            {C.s3.check}
          </Link>
          <div style={{ textAlign: "center" }}>
            <Link href={here(4)} prefetch={false} className="btn btn-quiet">
              {C.s3.notShowing}
            </Link>
          </div>
        </div>
      </>
    );
  } else {
    body = (
      <>
        {title(C.s4.title, C.s4.body(agent.name))}
        <div className="copy-box">{C.s4.message}</div>
        <div className="stack stack-1">
          {live ? (
            <>
              <ExternalThenGo href={claudeTestLink()} next={here(3)}>
                {C.s4.button(agent.name)}
              </ExternalThenGo>
              <div style={{ textAlign: "center" }}>
                <CopyButton text={C.s4.message} label={C.s4.copyInstead} copiedLabel={C.s1.copied} />
              </div>
            </>
          ) : (
            <CopyButton text={C.s4.message} label={C.s4.copyInstead} copiedLabel={C.s1.copied} primary block />
          )}
        </div>
        <Link href={here(3)} prefetch={false} className="btn btn-block">
          {C.s3.check}
        </Link>
      </>
    );
  }

  const back = step === 1 ? `/start/setup?agent=${agent.key}` : here(step === 3 && !live ? 1 : step - 1);
  const position = Math.max(
    picked.findIndex((a) => a.key === agent.key),
    0,
  );
  return (
    <Narrow>
      <div className="stack stack-3">
        <span className="eyebrow">
          {agent.name} {"·"} {C.stepOf(n, 4)}
        </span>
        <div className="dots" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <i key={i} className={i <= n ? "on" : undefined} />
          ))}
        </div>
      </div>
      {body}
      <p className="caption">
        {C.agentOf(position + 1, Math.max(picked.length, 1))}.{following ? ` ${C.then(following.name)}` : ""}
      </p>
      <BackLink href={back} />
      <form action={doThisLater}>
        <button type="submit" className="btn-quiet pull-left">
          {C.later}
        </button>
      </form>
    </Narrow>
  );
}
