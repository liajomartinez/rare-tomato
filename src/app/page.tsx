import { redirect } from "next/navigation";
import { agentsFor, rulesFor, scoringFor, tasksFor } from "@/db/production";
import { currentSession } from "@/lib/session";
import { InstallCard } from "./InstallCard";
import { ScoreCard } from "./ScoreCard";
import { agentsNeedingStep } from "@/lib/onboarding";
import { agentsNeedStep } from "@/lib/strings";
import { button, card, muted, Nav, page, SignedInAs } from "./ui";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await currentSession();
  if (session.status === "needs_attestation") redirect("/welcome");

  if (session.status !== "ready") {
    return (
      <main style={page}>
        <h1>Rare Tomato</h1>
        {session.status === "unconfigured" && <p>Rare Tomato is under construction.</p>}
        {session.status === "signups_closed" && <p role="status">New accounts are paused for now. If you already have an account, sign in again later.</p>}
        {session.status === "signed_out" && (
          <>
            <p>Correct an agent in a few taps, and every agent you use can get the rule from one place.</p>
            <p>
              <a href="/sign-in">Sign in</a>
            </p>
          </>
        )}
      </main>
    );
  }

  const scoring = scoringFor(session.person.id);
  const [agents, toReview, summary, freshness, modelOn, rules] = await Promise.all([
    agentsFor(session.person.id).list(),
    tasksFor(session.person.id).reviewCount(),
    scoring.summary(),
    scoring.freshness(),
    scoring.modelCallsOn(),
    rulesFor(session.person.id).list(),
  ]);
  // The install card appears only after the first agent is connected or the first rule is approved (SPEC FR-K2).
  const installEligible = agents.some((a) => a.status === "active") || rules.some((r) => r.approvedAt !== null);
  const waiting = agents.filter((a) => a.status === "unassigned").length;
  const connected = agents.filter((a) => a.status === "active").length;
  const needStep = agentsNeedingStep(agents);

  return (
    <main style={page}>
      <Nav />
      <h1>Rare Tomato</h1>
      <SignedInAs email={session.person.email} />
      {waiting > 0 ? (
        <p role="status">
          <strong>
            {waiting} new {waiting === 1 ? "agent is" : "agents are"} waiting for you.
          </strong>{" "}
          <a href="/agents">Check who it is</a>
        </p>
      ) : null}
      {needStep > 0 ? (
        <p role="status">
          <strong>{agentsNeedStep(needStep)}.</strong> <a href="/agents">Open Your agents</a>
        </p>
      ) : null}
      <ScoreCard
        percent={summary.score.percent}
        scored={summary.score.scored}
        tasksLogged={summary.tasksLogged14d}
        freshnessPercent={freshness}
        paused={!modelOn}
        needsAnswer={summary.needsAnswer}
      />
      <section style={card} aria-label="Things to review">
        <h2>
          {toReview === 0 ? "Nothing to review right now" : `${toReview} ${toReview === 1 ? "thing" : "things"} to review`}
        </h2>
        <p style={muted}>
          {toReview === 0
            ? "When one of your agents records a task, it shows up here. What you see is agent-reported: it is what the agent chose to tell us."
            : "These are tasks your agents recorded that you have not rated yet (agent-reported). A thumbs down with a reason can become a rule you approve."}
        </p>
        <p>
          <a href="/feed?unreviewed=1" style={{ ...button, display: "inline-block", lineHeight: "44px", padding: "0 1rem" }}>
            Review
          </a>
        </p>
      </section>
      {connected === 0 && waiting === 0 ? <p>You have not connected an agent yet. <a href="/agents">See how</a>.</p> : <p>{connected} connected {connected === 1 ? "agent" : "agents"}.</p>}
      <InstallCard eligible={installEligible} />
      <p style={muted}>Add your details on <a href="/profile">Your details</a>. Nothing is shared with an agent until you confirm it.</p>
    </main>
  );
}
