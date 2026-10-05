import Link from "next/link";
import { redirect } from "next/navigation";
import { agentsFor } from "@/db/production";
import type { AgentView } from "@/lib/agents-view";
import { UNASSIGNED_LIFETIME_DAYS } from "@/lib/connections";
import { flowAgent, type FlowAgent } from "@/lib/onboarding-flow";
import { messageReady, verifyState } from "@/lib/onboarding";
import { GUIDED, messageLinkKey, shortWhen } from "@/lib/platforms";
import { currentSession } from "@/lib/session";
import { CHATGPT_WEBSITE_NOTE, GROK_DESKTOP_NOTE, GROK_MESSAGE, linkFor, MCP_URL, MUSE_DESKTOP_NOTE, MUSE_MESSAGE, S } from "@/lib/strings";
import { CopyBlock, CopyButton } from "../../care-sheet/CopyButton";
import { ConfirmForm } from "../../agents/ConfirmForm";
import { InstructionBlock, OpenButton, ShowWhere } from "../../agents/SetupParts";
import { revokeAgent } from "../../agents/actions";
import { Banner, StatusIcon, Tag } from "../../ui";
import { doThisLater } from "../actions";
import { BackLink, Narrow, SetupFooter, StepBar } from "../parts";

export const dynamic = "force-dynamic";

// First-login setup for ONE agent (SPEC A4 to A7).
//   Claude and ChatGPT: 1 Connect, 2 Add the instruction, 3 Make sure it works. Grok Bot and Muse: one pasted message, then the same check.
//   "Ready" comes only from real calls that reached OUR server (get_rules and log_task for Claude and ChatGPT; the first real call for Grok Bot and Muse).
//   The "I connected" and "I added it" buttons are not proof and are never treated as proof.
//   Right after an agent signs in it is waiting for a confirmation (and a name). Until that is done it can use nothing, so this page shows the confirm
//   step instead of the next one (owner decision 11).
type Step = "connect" | "instruction" | "verify";
const STEPS: Step[] = ["connect", "instruction", "verify"];

function StatusRow({ done, children, alert }: { done: boolean; alert?: boolean; children: string }) {
  return (
    <div className="status-line">
      <StatusIcon kind={done ? "check" : alert ? "alert" : "outline"} />
      <b>{children}</b>
      {done ? null : alert ? null : <span className="caption">{S.onb.setup.verify.waiting}</span>}
    </div>
  );
}

export default async function SetupStep({ searchParams }: { searchParams: Promise<{ agent?: string; step?: string; another?: string; again?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status !== "ready") redirect(session.status === "needs_attestation" ? "/welcome" : "/");
  const q = await searchParams;
  const agent = flowAgent(q.agent);
  if (!agent) redirect("/start/agents");
  const step: Step = STEPS.includes(q.step as Step) ? (q.step as Step) : "connect";
  const agents = await agentsFor(session.person.id).list();
  const here = (s?: Step) => `/start/setup?agent=${agent.key}${s ? `&step=${s}` : ""}`;

  // An agent of this kind has signed in and is waiting to be confirmed and named.
  const waiting = agents.find((a) => a.status === "unassigned" && a.suggestedType === agent.type) ?? agents.find((a) => a.status === "unassigned" && a.suggestedType === null);
  if (waiting) {
    return (
      <Narrow>
        <BackLink href={`/start/agents`} />
        <section className="card card-ink card-roomy" aria-label={S.agents.waitingTitle(agent.name)}>
          <div className="stack stack-3">
            <h1>{S.agents.waitingTitle(agent.name)}</h1>
            <p className="lead">{S.agents.waitingBody}</p>
            <p className="caption">{S.agents.waitingData}</p>
          </div>
          <ConfirmForm agent={waiting} existing={agents} expected={agent.type} next={here(agent.type === "claude" || agent.type === "chatgpt" ? "instruction" : undefined)} button={S.agents.confirm(agent.name)} />
          {waiting.expiresAt ? <p className="caption">{S.agents.expiry(shortWhen(waiting.expiresAt), UNASSIGNED_LIFETIME_DAYS)}</p> : null}
        </section>
        <form action={revokeAgent}>
          <input type="hidden" name="id" value={waiting.id} />
          <button type="submit" className="btn-quiet pull-left">
            This is not my agent
          </button>
        </form>
      </Narrow>
    );
  }

  const mine = agents.find((a) => a.status === "active" && a.type === agent.type);
  if (agent.type === "claude" || agent.type === "chatgpt") return <Guided agent={agent} type={agent.type} step={step} mine={mine} here={here} />;
  return <Message agent={agent} mine={mine} another={q.another === "1"} again={q.again === "1"} here={here} />;
}

// ---- Claude and ChatGPT ----
function Guided({ agent, type, step, mine, here }: { agent: FlowAgent; type: "claude" | "chatgpt"; step: Step; mine?: AgentView; here: (s?: Step) => string }) {
  const G = GUIDED[type];
  const U = S.onb.setup;
  const V = U.verify;
  const n = STEPS.indexOf(step) + 1;
  const bar = <StepBar label={agent.name} n={n} />;

  if (step === "connect") {
    const c = G.connect;
    return (
      <Narrow>
        <BackLink href="/start/agents" />
        {bar}
        <div className="stack stack-3">
          <h1>{c.title}</h1>
          <p className="lead">{c.body}</p>
        </div>
        <div className="stack stack-3">
          {"name" in c ? <CopyBlock label={c.nameLabel} value={c.name} buttonLabel={U.copy} copiedLabel={U.copied} tight /> : null}
          <CopyBlock label={c.urlLabel} value={MCP_URL} buttonLabel={U.copyUrl} copiedLabel={U.copied} tight />
        </div>
        <ol className="steps">
          {c.steps.map((s) => (
            <li key={s}>
              <span className="step-text">{s}</span>
            </li>
          ))}
        </ol>
        <div className="stack stack-2">
          <OpenButton linkKey={G.connectLink} primary>
            {c.primary}
          </OpenButton>
          <ShowWhere intro={type === "claude" ? "Or find it in Claude:" : undefined} paths={"fallback2" in c ? [c.fallback, c.fallback2] : [c.fallback]} />
        </div>
        <SetupFooter later={doThisLater}>
          <Link href={here("instruction")} prefetch={false} className="btn">
            {U.done}
          </Link>
        </SetupFooter>
      </Narrow>
    );
  }

  if (step === "instruction") {
    return (
      <Narrow>
        <BackLink href={here("connect")} />
        {bar}
        <div className="stack stack-3">
          <h1>{U.instr.title(agent.name)}</h1>
          <p className="lead">{U.instr.body(agent.name)}</p>
        </div>
        <div className="stack stack-3">
          <InstructionBlock />
          {type === "chatgpt" ? <p className="caption">{CHATGPT_WEBSITE_NOTE}</p> : null}
          <OpenButton linkKey={G.instrLink}>{G.instr.open}</OpenButton>
          <ShowWhere steps={G.instr.where} />
        </div>
        <SetupFooter later={doThisLater}>
          <Link href={here("verify")} prefetch={false} className="btn">
            {U.added}
          </Link>
        </SetupFooter>
      </Narrow>
    );
  }

  // verify
  const seen = mine?.calls ?? { rules: null, details: null, task: null };
  const state = mine ? verifyState(seen) : "waiting";
  const name = mine?.name ?? agent.name;
  const prompt = `${S.agents.prompt} ${V.partialPrompt}`;
  const trouble = (
    <details>
      <summary>{V.trouble}</summary>
      <ul className="stack stack-2" style={{ margin: "var(--space-3) 0 0", paddingLeft: 20, font: "var(--font-list)" }}>
        {V.troubleList.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </details>
  );

  if (state === "ready") {
    return (
      <Narrow>
        {bar}
        <div className="stack stack-3">
          <h1>{V.ready(name)}</h1>
          <p className="lead">{V.readyBody}</p>
        </div>
        <div className="status-block status-block-done status-rows" role="status">
          <StatusRow done>{V.checkedRules}</StatusRow>
          <StatusRow done>{V.reportedTask}</StatusRow>
        </div>
        <Done />
      </Narrow>
    );
  }

  return (
    <Narrow>
      <BackLink href={here("instruction")} />
      {bar}
      <div className="stack stack-3">
        <h1>{V.title}</h1>
        <p className="lead">{V.body(name)}</p>
      </div>
      {state === "partial" ? <Banner tone="headsup">{V.partial(name)}</Banner> : null}
      <div className="status-block status-rows" role="status">
        <StatusRow done={Boolean(seen.rules)}>{V.checkedRules}</StatusRow>
        <StatusRow done={false} alert={state === "partial"}>
          {V.reportedTask}
        </StatusRow>
      </div>
      <div className="stack stack-3">
        <p className="strong-line">{state === "partial" ? V.partialPrompt : `Start a new chat in ${agent.name} and paste this.`}</p>
        <div className="copy-box">{prompt}</div>
        <CopyButton text={prompt} label={U.copy} copiedLabel={U.copied} block />
      </div>
      <div className="stack stack-2">
        <Link href={here("verify")} prefetch={false} className="btn btn-primary btn-block">
          {V.tryAgain}
        </Link>
        <OpenButton linkKey={G.afterLink}>{V.open(agent.name)}</OpenButton>
        {trouble}
      </div>
      {state === "waiting" ? (
        <SetupFooter later={doThisLater} />
      ) : null}
    </Narrow>
  );
}

/** Continue to Rare Tomato (primary) and Connect another agent (secondary). */
function Done() {
  return (
    <div className="stack stack-2">
      <Link href="/" prefetch={false} className="btn btn-primary btn-block">
        {S.onb.setup.verify.continue}
      </Link>
      <Link href="/start/agents" prefetch={false} className="btn btn-block">
        {S.onb.setup.verify.another}
      </Link>
    </div>
  );
}

// ---- Grok Bot and Muse: one pasted message ----
/** `again`: show the pasted message even though the agent has already been heard from (Reconnect). */
function Message({ agent, mine, another, again, here }: { agent: FlowAgent; mine?: AgentView; another: boolean; again: boolean; here: (s?: Step) => string }) {
  const U = S.onb.setup;
  const muse = agent.type === "muse";
  const M = muse ? U.muse : U.grok;
  const ready = !again && Boolean(mine && messageReady(mine.calls));
  const linkKey = messageLinkKey(agent.type);

  if (ready) {
    return (
      <Narrow>
        {muse ? (
          <div>
            <Tag strong>{S.onb.pick.experimental}</Tag>
          </div>
        ) : null}
        <div className="stack stack-3">
          <h1>{muse ? U.muse.ready : U.grok.ready}</h1>
          <p className="lead">{muse ? U.muse.readyBody : U.grok.readyBody}</p>
        </div>
        {muse ? null : (
          <div className="status-block status-block-done status-rows" role="status">
            <StatusRow done>{S.onb.setup.verify.checkedRules}</StatusRow>
          </div>
        )}
        {muse ? <Banner tone="headsup">{U.muse.notice}</Banner> : null}
        <Done />
        {muse ? (
          <Link href={`${here()}&again=1`} prefetch={false} className="btn btn-block">
            {S.agents.reconnect}
          </Link>
        ) : null}
      </Narrow>
    );
  }

  // Grok Bot, "Connect another way": only if the chat setup did not work.
  if (!muse && another) {
    const G = U.grok;
    return (
      <Narrow>
        <BackLink href={here()} />
        <div className="stack stack-3">
          <h1>{G.failTitle}</h1>
          <p className="lead">{G.failBody}</p>
        </div>
        <CopyBlock label={G.failUrlLabel} value={MCP_URL} buttonLabel={U.copyUrl} copiedLabel={U.copied} tight />
        <div className="stack stack-2">
          <OpenButton linkKey="open_grok_bot_connectors" primary>
            {G.failOpen}
          </OpenButton>
          {linkFor("open_grok_bot_connectors") ? (
            <p className="caption">
              <a href={G.failUrl} target="_blank" rel="noopener noreferrer">
                {G.failUrl}
              </a>
            </p>
          ) : null}
        </div>
        <SetupFooter later={doThisLater} />
      </Narrow>
    );
  }

  const message = muse ? MUSE_MESSAGE : GROK_MESSAGE;
  return (
    <Narrow>
      <BackLink href="/start/agents" />
      <div className="stack stack-3">
        {muse ? (
          <div>
            <Tag strong>{S.onb.pick.experimental}</Tag>
          </div>
        ) : null}
        <h1>{M.title}</h1>
        <p className="lead">{M.body}</p>
      </div>
      <div className="copy-box">{message}</div>
      <div className="stack stack-2">
        <CopyButton text={message} label={M.copy} copiedLabel={U.copied} primary block />
        {linkKey ? <OpenButton linkKey={linkKey}>{M.open}</OpenButton> : null}
        {muse ? null : (
          <div style={{ textAlign: "center" }}>
            <Link href={`${here()}&another=1`} prefetch={false} className="btn btn-quiet">
              {U.grok.anotherWay}
            </Link>
          </div>
        )}
      </div>
      {muse ? <Banner tone="headsup">{U.muse.notice}</Banner> : <p className="caption">{U.grok.note}</p>}
      <p className="caption">{muse ? MUSE_DESKTOP_NOTE : GROK_DESKTOP_NOTE}</p>
      <SetupFooter later={doThisLater}>
        <Link href={here()} prefetch={false} className="btn">
          {S.onb.setup.verify.tryAgain}
        </Link>
      </SetupFooter>
    </Narrow>
  );
}

