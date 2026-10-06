import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { agentsFor, rulesFor, scoringFor, tasksFor } from "@/db/production";
import type { AgentView } from "@/lib/agents-view";
import { FLOW_AGENTS, LATER_COOKIE, parsePicked, PICKED_COOKIE } from "@/lib/onboarding-flow";
import { COPY, type AgentKey } from "@/lib/onboarding-copy";
import { railAt, resumeStep, type Step } from "@/lib/onboarding-steps";
import { needsFinishSetup } from "@/lib/onboarding";
import { TYPE_LABEL } from "@/lib/platforms";
import { MIN_REPORTED_TASKS } from "@/lib/scoring/config";
import { tomatoFor } from "@/lib/scoring/verdict";
import { currentSession } from "@/lib/session";
import { S, SCORE_PAUSED } from "@/lib/strings";
import { InstallCard } from "./InstallCard";
import { Landing } from "./start/Landing";
import { reconnectAgent, removeAgent } from "./agents/actions";
import { AgentLabel, Nav, PageSheet } from "./ui";

export const dynamic = "force-dynamic";

// Home (round 12). One card at most, and only around the single next step. Everything else is plain text. The page says what to do next and nothing more:
//   setup unfinished -> one "Next step" card; an agent connected with no rule -> the same card for the rule; a rule and no tasks -> one sentence;
//   tasks to review -> one card; five or more tasks -> one plain rule-following line; an expired agent -> one card (Reconnect, Remove).

/** The next step for an agent whose setup is not finished: the headline, the one line saying why, and which step of 3 it is. */
function nextStepFor(name: string, step: Step, key: AgentKey) {
  const n = name;
  if (step === "instruction") return { headline: `Tell ${n} to use Rare Tomato`, why: `${n} only checks your rules if you ask it to.`, at: 2, button: "Continue" };
  if (step === "check") return { headline: "Check it works", why: "Let's make sure it works.", at: 2, button: "Continue" };
  if (step === "rule") return { headline: "Write your first rule", why: "Your agents check your rules before they work for you.", at: 3, button: "Write a rule" };
  return { headline: `Connect ${n}`, why: `${n} can't see your rules until it's connected.`, at: railAt(key, step), button: "Continue" };
}

function statusOf(a: AgentView) {
  if (a.setup.kind === "working") return S.agents.working;
  if (needsFinishSetup(a)) return S.agents.setupNot;
  return S.agents.connected;
}

export default async function Home({ searchParams }: { searchParams?: Promise<{ sheet?: string }> } = {}) {
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

  const q = (await searchParams) ?? {};
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
  const waiting = agents.filter((a) => a.status === "unassigned");
  const expired = agents.filter((a) => a.status === "expired");
  const hasTasks = anyTask.length > 0;
  const live = rules.filter((r) => r.status === "active");
  // A brand-new account goes straight into the first-login flow. "Do this later" lands on Home instead.
  if (active.length === 0 && waiting.length === 0 && expired.length === 0 && !hasTasks && live.length === 0 && picked.length === 0 && !later) redirect("/start/roadmap");

  // The first picked agent (Claude when nothing was picked) whose setup is not finished.
  const focus = (picked.length ? picked : FLOW_AGENTS.filter((a) => a.key === "claude"))
    .map((a) => {
      const key = a.key as AgentKey;
      return { key, name: a.name, step: resumeStep(key, active.find((x) => x.type === a.type), live.length > 0) };
    })
    .find((x) => x.step !== "done");
  const firstName = active[0]?.name ?? focus?.name ?? "Claude";
  const nameOf = new Map(agents.map((a) => [a.id, a.name]));

  // ---- the one card ----
  let context: string | null = null;
  let card: React.ReactNode = null;
  const first = newest[0];
  if (expired.length > 0) {
    const a = expired[0];
    card = (
      <section className="card card-ink card-roomy" aria-label={`${a.name} ${S.agents.expired.toLowerCase()}`}>
        <h2>
          {a.name} {S.agents.expired.toLowerCase()}
        </h2>
        <form action={reconnectAgent}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn-primary btn-block">
            {S.agents.reconnect}
          </button>
        </form>
        <form action={removeAgent}>
          <input type="hidden" name="id" value={a.id} />
          <button type="submit" className="btn-quiet pull-left">
            {S.agents.remove}
          </button>
        </form>
      </section>
    );
  } else if (focus) {
    const n = nextStepFor(focus.name, focus.step, focus.key);
    context = `Set up Rare Tomato so ${focus.name} checks your rules.`;
    card = (
      <section className="card card-ink card-roomy" aria-label={COPY[focus.key].finish}>
        <p className="eyebrow">Next step</p>
        <h2>{n.headline}</h2>
        <p style={{ margin: 0 }}>{n.why}</p>
        <p className="caption">Step {n.at} of 3</p>
        <Link href={`/start/setup?agent=${focus.key}${focus.step === "rule" ? "&step=rule" : ""}`} prefetch={false} className="btn btn-primary btn-block">
          {n.button}
        </Link>
      </section>
    );
  } else if (waiting.length > 0) {
    const a = waiting[0];
    const platform = a.suggestedType ? TYPE_LABEL[a.suggestedType] : "agent";
    card = (
      <section className="card card-ink card-roomy" aria-label={S.agents.confirm(platform)}>
        <p className="eyebrow">Next step</p>
        <h2>{S.agents.confirm(platform)}</h2>
        <p style={{ margin: 0 }}>{S.agents.waitingData}</p>
        <Link href={`/agents/confirm?agent=${a.id}`} prefetch={false} className="btn btn-primary btn-block">
          {S.agents.confirm(platform)}
        </Link>
      </section>
    );
  } else if (live.length === 0) {
    card = (
      <section className="card card-ink card-roomy" aria-label={S.onb.dash.nextTitle}>
        <p className="eyebrow">Next step</p>
        <h2>{S.onb.dash.nextTitle}</h2>
        <p style={{ margin: 0 }}>{S.onb.dash.nextBody}</p>
        <Link href="/rules/new" prefetch={false} className="btn btn-primary btn-block">
          {S.onb.dash.nextButton}
        </Link>
      </section>
    );
  } else if (toReview > 0 && first) {
    card = (
      <section className="card card-ink card-roomy" aria-label="Things to review">
        <p className="eyebrow">{S.home.reviewSticker(toReview)}</p>
        <p style={{ margin: 0, font: "var(--font-lead)", textWrap: "balance" }}>
          <b>{first.agentName}</b> {first.summary}
        </p>
        <p className="caption">Was it right?</p>
        <Link href="/feed?unreviewed=1" prefetch={false} className="btn btn-primary btn-block">
          {S.home.review}
        </Link>
        <Link href="/feed?unreviewed=0" prefetch={false} className="btn btn-quiet pull-left">
          See all
        </Link>
      </section>
    );
  }

  // ---- plain lines under the card ----
  // While setup is unfinished the card is the whole page. An agent connected with no rule, or a rule and no tasks, also gets one plain line per agent.
  const showAgentLines = (!focus || focus.step === "rule") && active.length > 0;
  const noTasksSentence = !focus && live.length > 0 && !hasTasks ? `Ask ${firstName} to help with something. Its tasks show up in ${S.feed.title}.` : null;
  const best = summary.byAgent.filter((x) => nameOf.has(x.connectionId))[0];
  const scoreLine =
    best && best.reportedTasks >= MIN_REPORTED_TASKS
      ? `${nameOf.get(best.connectionId)}'s rule following: ${best.score.percent === null ? "still learning" : `${best.score.percent}%, ${tomatoFor(best.score.percent).label}`}. ${S.agentReported}, based on ${best.reportedTasks} tasks.`
      : null;

  return (
    <>
      <Nav current="home" />
      <main className="page-flat">
        <h1>{S.onb.dash.title}</h1>
        {context ? <p className="caption">{context}</p> : null}
        {card}
        {noTasksSentence ? <p className="plain-line">{noTasksSentence}</p> : null}
        {showAgentLines ? (
          <div className="stack stack-1">
            {active.map((a) => (
              <p key={a.id} className="plain-line">
                <AgentLabel name={a.name} type={a.type ? TYPE_LABEL[a.type] : null} /> {"·"} {statusOf(a)}
              </p>
            ))}
          </div>
        ) : null}
        {scoreLine && !focus ? (
          <p className="plain-line">
            {scoreLine} <Link href="/?sheet=scoring" prefetch={false} className="link-sm">{S.score.how}</Link>
          </p>
        ) : null}
        <InstallCard eligible={hasTasks} />
      </main>
      {q.sheet === "scoring" ? (
        <PageSheet title={S.score.how} closeHref="/">
          <p>{S.score.howNote}</p>
          {!modelOn ? <p className="caption">{SCORE_PAUSED}</p> : null}
          {summary.needsAnswer > 0 ? (
            <p>
              <Link href="/feed?unreviewed=1" prefetch={false} className="link">
                {summary.needsAnswer} {summary.needsAnswer === 1 ? "check needs" : "checks need"} your answer
              </Link>
            </p>
          ) : null}
        </PageSheet>
      ) : null}
    </>
  );
}
