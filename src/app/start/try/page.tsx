import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import { flowAgent, nextPicked, parsePicked, PICKED_COOKIE } from "@/lib/onboarding-flow";
import { currentSession } from "@/lib/session";
import { MUSE_EXPERIMENTAL_LINE, MUSE_NO_REQUESTS, S } from "@/lib/strings";
import { shortDate } from "../../agents/Setup";
import { StatusIcon } from "../../ui";
import { doThisLater } from "../actions";
import { Head, Narrow } from "../parts";

export const dynamic = "force-dynamic";

// Try it (SPEC A7). The status changes only when OUR server has logged the agent asking for rules or details; we cannot see whether the line was saved.
// Waiting: "Set up: not finished", a Check again button and three causes. Working: the dated line and a button that moves on.
// Muse (experimental) has no starter line to check, so it shows its own status and the experimental line instead of the three causes.
export default async function TryIt({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const session = await currentSession();
  if (session.status !== "ready") redirect("/start/account");
  const q = await searchParams;
  const agent = flowAgent(q.agent);
  if (!agent) redirect("/start/agents");
  const agents = await agentsFor(session.person.id).list();
  const mine = agents.find((a) => a.status === "active" && a.type === agent.type);
  if (!mine) redirect(`/start/connect?agent=${agent.key}&step=3`);
  const Y = S.onb.setup.try;
  const picked = parsePicked((await cookies()).get(PICKED_COOKIE)?.value);
  const following = nextPicked(picked, agent.key);
  const next = following ? `/start/setup?agent=${following.key}` : "/";
  const working = mine.setup.kind === "working";
  const muse = agent.key === "muse";
  const here = `/start/try?agent=${agent.key}`;

  return (
    <Narrow>
      <div className="stack stack-3">
        <span className="eyebrow">{Y.last}</span>
        <Head title={Y.title(mine.name)} body={muse ? MUSE_EXPERIMENTAL_LINE : Y.body(mine.name)} />
      </div>
      <div className={`status-block${working ? " status-block-done" : ""}`} role="status">
        <div className="row row-nowrap">
          <StatusIcon kind={working ? "check" : "outline"} />
          <b style={{ font: "var(--font-status)" }}>
            {mine.setup.kind === "working" ? Y.working(shortDate(mine.setup.at)) : muse ? MUSE_NO_REQUESTS : S.agents.statusNot}
          </b>
        </div>
        {!working && !muse ? <span className="caption status-help">{S.agents.statusNotHelp}</span> : null}
      </div>
      {working ? (
        <Link href={next} prefetch={false} className="btn btn-primary btn-block">
          {following ? S.onb.connect.then(following.name) : S.onb.dash.title}
        </Link>
      ) : (
        <>
          <Link href={here} prefetch={false} className="btn btn-primary btn-block">
            {Y.check}
          </Link>
          {muse ? (
            <Link href={next} prefetch={false} className="btn btn-block">
              {following ? S.onb.connect.then(following.name) : S.onb.dash.title}
            </Link>
          ) : (
            <div className="stack stack-3 rule-above">
              <h2 style={{ font: "var(--font-h4)" }}>{Y.helpHeading}</h2>
              <ul style={{ margin: 0, paddingLeft: 20, font: "var(--font-list)" }} className="stack stack-2">
                {Y.help.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>
              <p className="caption">{Y.honest}</p>
            </div>
          )}
          <form action={doThisLater}>
            <button type="submit" className="btn-quiet pull-left">
              {S.onb.connect.later}
            </button>
          </form>
        </>
      )}
    </Narrow>
  );
}
