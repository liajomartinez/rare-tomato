import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/session";
import { flowAgent, parsePicked, PICKED_COOKIE, setupGuide } from "@/lib/onboarding-flow";
import { STARTER_LINE, S } from "@/lib/strings";
import { CopyButton } from "../../care-sheet/CopyButton";
import { Banner, Tag } from "../../ui";
import { BackLink, Narrow } from "../parts";
import { doThisLater } from "../actions";

export const dynamic = "force-dynamic";

// Setup step 1 for one agent (SPEC A4): get the starter line into the agent's own instructions. It comes first because a connected agent ignores saved
// rules unless told to look; one plain sentence says so. Per agent (data in S.onb.setup.guides): Claude and ChatGPT are Required, Grok Bot is Optional.
// Muse is shown as EXPERIMENTAL (owner decision, 2026-10-03): there is no line to paste and nobody is told to instruct it in every chat.
export default async function SetupStep({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status === "needs_attestation") redirect("/welcome");
  const q = await searchParams;
  const agent = flowAgent(q.agent);
  if (!agent) redirect("/start/agents");
  const U = S.onb.setup;
  const g = setupGuide(agent);
  const picked = parsePicked((await cookies()).get(PICKED_COOKIE)?.value);
  const backHref = picked.length > 1 && picked[0].key !== agent.key ? `/start/try?agent=${picked[picked.findIndex((a) => a.key === agent.key) - 1]?.key ?? picked[0].key}` : "/start/agents";
  const connectHref = `/start/connect?agent=${agent.key}&step=1`;
  const experimental = g.kind === "experimental";
  const optional = g.kind === "optional";
  const kindLabel = g.kind === "required" ? U.required : optional ? U.optional : U.experimental;

  const more = (
    <div className="stack rule-above">
      {g.steps.length > 0 ? (
        <ol className="steps">
          {g.steps.map((s) => (
            <li key={s}>
              <span className="step-text">{s}</span>
            </li>
          ))}
        </ol>
      ) : null}
      {!("intro" in g) ? <p className="caption">{U.whyMore}</p> : null}
      {g.kind === "required" ? <Banner tone="info">{U.evidence}</Banner> : null}
      <div className="stack stack-1">
        <p className="caption">{U.fallback(agent.name)}</p>
        <p className="caption">{U.lastChecked(U.checkedOn)}</p>
      </div>
    </div>
  );

  return (
    <Narrow>
      <div className="stack stack-3">
        <div className="row">
          <span className="eyebrow">
            {agent.name} {"\u00B7"} {S.onb.connect.stepOf(1, 4)}
          </span>
          <Tag strong={g.kind === "required"}>{kindLabel}</Tag>
        </div>
        <h1>{experimental ? U.museTitle : U.title(agent.name)}</h1>
        {"intro" in g ? <p className="lead">{g.intro}</p> : <p className="lead" style={{ fontWeight: "var(--fw-semibold)" }}>{U.why}</p>}
      </div>

      {experimental ? (
        <Link href={connectHref} prefetch={false} className="btn btn-primary btn-block">
          {U.skipOptional}
        </Link>
      ) : optional ? (
        <div className="stack stack-3">
          <Link href={connectHref} prefetch={false} className="btn btn-primary btn-block">
            {U.skipOptional}
          </Link>
          <div className="stack stack-2">
            <div className="copy-box">{STARTER_LINE}</div>
            <CopyButton text={STARTER_LINE} label={U.copy} copiedLabel={U.copied} block />
          </div>
        </div>
      ) : (
        <>
          <div className="stack stack-3">
            <div className="copy-box">{STARTER_LINE}</div>
            <CopyButton text={STARTER_LINE} label={U.copy} copiedLabel={U.copied} primary block />
          </div>
          <p className="strong-line">{U.addEnd}</p>
          <Link href={connectHref} prefetch={false} className="btn btn-block">
            {U.pasted}
          </Link>
        </>
      )}

      <details>
        <summary>
          <span className="swap">
            <span className="on-closed">{U.showWhere}</span>
            <span className="on-open">{U.hideWhere}</span>
          </span>
        </summary>
        {more}
      </details>

      <BackLink href={backHref} />
      <form action={doThisLater}>
        <button type="submit" className="btn-quiet pull-left">
          {S.onb.connect.later}
        </button>
      </form>
    </Narrow>
  );
}
