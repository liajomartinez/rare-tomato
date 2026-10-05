import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { agentsFor, rulesFor, scoringFor, tasksFor } from "@/db/production";
import { attentionOf } from "@/lib/attention";
import { FLOW_AGENTS, LATER_COOKIE, parsePicked, PICKED_COOKIE } from "@/lib/onboarding-flow";
import { shortDate, TYPE_LABEL } from "@/lib/platforms";
import { currentSession } from "@/lib/session";
import { ExpiredCard } from "./agents/ExpiredCard";
import { attentionBody, attentionTitle, NO_CALLS_YET, S } from "@/lib/strings";
import { whoCanSeeRule } from "@/lib/agents-view";
import { COPY, type AgentKey } from "@/lib/onboarding-copy";
import { railAt, resumeStep } from "@/lib/onboarding-steps";
import { InstallCard } from "./InstallCard";
import { RailBar } from "./start/onb";
import { ScoreCard } from "./ScoreCard";
import { AgentAvatar, Banner, Nav, SignedInAs, Sticker, WhoCanSee } from "./ui";
import { Landing } from "./start/Landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (session.status === "needs_attestation") redirect("/welcome");

  if (session.status !== "ready") {
    if (session.status === "signed_out") return <Landing />;
    return (
      <>
        <header className="appbar" />
        <main className="page">
          <h1>{S.product}</h1>
          {session.status === "unconfigured" && <p>Rare Tomato is under construction.</p>}
          {session.status === "signups_closed" && <p role="status">New accounts are paused for now. If you already have an account, sign in again later.</p>}
        </main>
      </>
    );
  }

  const scoring = scoringFor(session.person.id);
  const [agents, toReview, newest, anyTask, summary, modelOn, rules] = await Promise.all([
    agentsFor(session.person.id).list(),
    tasksFor(session.person.id).reviewCount(),
    tasksFor(session.person.id).feed({ notReviewed: true, limit: 1 }),
    tasksFor(session.person.id).feed({ limit: 1 }),
    scoring.summary(),
    scoring.modelCallsOn(),
    rulesFor(session.person.id).list(),
  ]);
  const jar = await cookies();
  const picked = parsePicked(jar.get(PICKED_COOKIE)?.value);
  const later = jar.get(LATER_COOKIE)?.value === "1";

  const active = agents.filter((a) => a.status === "active");
  const waiting = agents.filter((a) => a.status === "unassigned").length;
  const hasTasks = anyTask.length > 0;
  const live = rules.filter((r) => r.status === "active");
  // A brand-new account goes straight into the first-login flow (SPEC part A). "Do this later" lands on Home instead.
  if (active.length === 0 && waiting === 0 && !hasTasks && live.length === 0 && picked.length === 0 && !later) redirect("/start/roadmap");

  // The one next step: set up the first picked agent that is not connected yet (Claude when nothing was picked).
  // The first picked agent (Claude when nothing was picked) whose setup is not finished: Home shows one "Finish setting up" card for it, with the rail where they stopped.
  const focus = (picked.length ? picked : FLOW_AGENTS.filter((a) => a.key === "claude"))
    .map((a) => {
      const key = a.key as AgentKey;
      const step = resumeStep(key, active.find((x) => x.type === a.type), live.length > 0);
      return { key, name: a.name, step };
    })
    .find((x) => x.step !== "done");
  const readers = whoCanSeeRule(agents, "all");
  const installEligible = active.length > 0 || live.length > 0;
  const attention = attentionOf(agents);

  // "2 things need your attention": agents to confirm, setup to finish, connections that timed out. One secondary button, because Home has its own primary.
  const attentionBanner =
    attention.count > 0 ? (
      <Banner
        tone="headsup"
        title={attentionTitle(attention.count)}
        action={
          <Link href="/agents" prefetch={false} className="btn btn-sm">
            {S.home.reviewSetup}
          </Link>
        }
      >
        {attentionBody(attention.confirm.length, attention.finish.length, attention.timedOut.length)}
      </Banner>
    ) : null;

  // An agent whose connection expired shows as its own card on Home, under its own name (never "Old <name>").
  const expiredCards =
    attention.timedOut.length > 0 ? (
      <div className="stack">
        {attention.timedOut.map((a) => (
          <ExpiredCard key={a.id} agent={a} />
        ))}
      </div>
    ) : null;

  // ---- First visit, and after "Do this later" (SPEC A8): one next step, quiet sections, no score or review yet ----
  if (active.length === 0 || !hasTasks) {
    const none = active.length === 0;
    const N = S.onb.dash.none;
    const sec = (heading: string, children: React.ReactNode) => (
      <section className="stack stack-3 rule-above">
        <h2 style={{ font: "var(--font-h4)" }}>{heading}</h2>
        {children}
      </section>
    );
    const next = focus ? (
      <section className="card card-ink card-roomy" aria-label={COPY[focus.key].finish}>
        <RailBar agent={focus.key} at={railAt(focus.key, focus.step)} />
        <Link href={`/start/setup?agent=${focus.key}`} prefetch={false} className="btn btn-primary btn-block">
          {COPY[focus.key].finish}
        </Link>
      </section>
    ) : live.length === 0 ? (
      <section className="card card-ink card-roomy" aria-label={S.onb.dash.nextEyebrow}>
        <h2>{S.onb.dash.nextTitle}</h2>
        <p>{S.onb.dash.nextBody}</p>
        <Link href="/rules" prefetch={false} className="btn btn-primary btn-block">
          {S.onb.dash.nextButton}
        </Link>
      </section>
    ) : null;
    const agentsList = none
      ? picked.length > 0
        ? sec(
            S.onb.dash.connectedHeading,
            <div className="stack">
              {picked.map((a) => (
                <div key={a.key} className="row row-nowrap">
                  <AgentAvatar name={a.name} size="md" />
                  <div className="stack stack-0 grow">
                    <b style={{ font: "var(--font-name-md)" }}>{a.name}</b>
                    <span className="caption">{N.status}</span>
                  </div>
                </div>
              ))}
            </div>,
          )
        : null
      : sec(
          S.onb.dash.connectedHeading,
          <div className="stack">
            {active.map((a) => (
              <div key={a.id} className="row row-nowrap" style={{ alignItems: "flex-start" }}>
                <AgentAvatar name={a.name} size="md" />
                <div className="stack stack-0 grow">
                  <b style={{ font: "var(--font-name-md)" }}>
                    {a.name} <span className="caption">{"·"} {a.type ? TYPE_LABEL[a.type] : "agent"}</span>
                  </b>
                  <span className="caption">{a.setup.kind === "working" ? `${S.agents.working}. ${S.agents.lastChecked(shortDate(a.setup.at))}` : NO_CALLS_YET}</span>
                </div>
              </div>
            ))}
          </div>,
        );
    const main = (
      <div className="stack stack-5">
        {next}
        {agentsList}
        {!none && !focus ? <p className="caption">{S.home.ask(active[0].name)}</p> : null}
      </div>
    );
    const rail = (
      <div className="stack stack-5">
        {none ? (
          <section className="stack stack-2 rule-above">
            <h2 style={{ font: "var(--font-h4)" }}>{S.home.whoTitle}</h2>
            <p className="caption">{N.noReaders}</p>
          </section>
        ) : (
          <WhoCanSee title={S.home.whoTitle} agents={readers} />
        )}
        <InstallCard eligible={installEligible} />
      </div>
    );
    return (
      <>
        <Nav current="home" />
        <main className="page">
          <h1>{S.onb.dash.title}</h1>
          {attentionBanner}
          {expiredCards}
          <div className="cols">
            {main}
            {rail}
          </div>
          <p className="caption">Add your saved details on <Link href="/profile">Your Info</Link>. Nothing is shared with an agent until you confirm it.</p>
          <SignedInAs email={session.person.email} />
        </main>
      </>
    );
  }

  // ---- The everyday Home (SPEC B5) ----
  const first = newest[0];
  const review =
    toReview > 0 && first ? (
      <section className="card card-roomy" aria-label="Things to review">
        <div>
          <Sticker>{S.home.reviewSticker(toReview)}</Sticker>
        </div>
        <div className="stack stack-2">
          <span className="eyebrow">{S.home.reviewNewest}</span>
          <p style={{ margin: 0, font: "var(--font-lead)", textWrap: "balance" }}>
            {first.agentName}: {first.summary}
          </p>
        </div>
        <Link href="/feed?unreviewed=1" prefetch={false} className="btn btn-primary btn-block">
          {S.home.review}
        </Link>
        <div className="row row-between">
          <Link href="/feed?unreviewed=1" prefetch={false} className="btn btn-quiet pull-right">
            {S.home.reviewAll(toReview)}
          </Link>
        </div>
      </section>
    ) : (
      <section className="card card-roomy" aria-label="Things to review">
        <h2>Nothing to review right now</h2>
        <p className="caption">{S.feed.pace}</p>
      </section>
    );

  // One rule-following card per agent that reported tasks, the one with the most reported tasks first.
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));
  const scoreCards = summary.byAgent
    .filter((x) => nameOf.has(x.connectionId))
    .map((x, i) => (
      <ScoreCard
        key={x.connectionId}
        agentName={nameOf.get(x.connectionId) as string}
        percent={x.score.percent}
        reportedTasks={x.reportedTasks}
        paused={!modelOn && i === 0}
        needsAnswer={i === 0 ? summary.needsAnswer : 0}
      />
    ));

  return (
    <>
      <Nav current="home" />
      <main className="page">
        <h1 className="home-title">{S.home.welcome}</h1>
        {attentionBanner}
        {expiredCards}
        <div className="cols cols-home">
          <div className="stack">
            {scoreCards.length > 0 ? (
              scoreCards
            ) : (
              <ScoreCard agentName={active[0].name} percent={null} reportedTasks={0} paused={!modelOn} needsAnswer={summary.needsAnswer} />
            )}
          </div>
          <div className="stack stack-5">
            {review}
            <InstallCard eligible={installEligible} />
            <WhoCanSee title={S.home.whoTitle} agents={readers} />
          </div>
        </div>
        <p className="caption">Add your saved details on <Link href="/profile">Your Info</Link>. Nothing is shared with an agent until you confirm it.</p>
        <SignedInAs email={session.person.email} />
      </main>
    </>
  );
}
