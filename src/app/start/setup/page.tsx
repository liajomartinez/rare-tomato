import Link from "next/link";
import { redirect } from "next/navigation";
import { agentsFor, rulesFor } from "@/db/production";
import { flowAgent } from "@/lib/onboarding-flow";
import { COPY, MUSE_NOTICE, UI, type AgentKey } from "@/lib/onboarding-copy";
import { GUIDED, resumeStep, STEPS, type Step } from "@/lib/onboarding-steps";
import type { LinkId } from "@/lib/agent-links";
import { currentSession } from "@/lib/session";
import { confirmAgent } from "../../agents/actions";
import { Banner, StatusIcon, Tag } from "../../ui";
import { CheckScreen } from "../CheckScreen";
import { Disclosures } from "../Disclosures";
import { ItemsScreen, OpenCopyScreen, WatchForAgent } from "../OpenCopy";
import { RuleStep } from "../RuleStep";
import { Actions, Clock, Later, OnbPage, OutLink, Shot, StepHeader, Title } from "../onb";

export const dynamic = "force-dynamic";

// First-login setup for ONE agent (round 9). The steps, by the screen ids in the handoff:
//   intro (C1, G1)  ->  form (C2, G2; for Grok Bot and Muse the one pasted message K1, M1)  ->  wait (C3)  ->  confirm and name (C4)
//   ->  instruction (C5, G5; Claude and ChatGPT only)  ->  check (C6 and its ready, almost there and not seen yet)  ->  rule (C7)  ->  done (C8)
// "Ready" comes only from real calls that reached OUR server (GET /agents/status reads our own audit log). No button here is proof.
// A person who comes back (Home's "Finish setting up" card) lands on the first step that is not done yet.

const INSTR_LINK: Partial<Record<AgentKey, LinkId>> = { claude: "L2", chatgpt: "L5" };
const CHAT_LINK: Record<AgentKey, LinkId> = { claude: "L3", chatgpt: "L6", grok: "L9", muse: "L11" };
const OPEN_LINK: Record<AgentKey, LinkId> = { claude: "L1", chatgpt: "L4", grok: "L7", muse: "L10" };

export default async function SetupStep({ searchParams }: { searchParams: Promise<{ agent?: string; step?: string; summary?: string; error?: string }> }) {
  const session = await currentSession();
  if (session.status === "signed_out") redirect("/start/account");
  if (session.status !== "ready") redirect(session.status === "needs_attestation" ? "/welcome" : "/");
  const q = await searchParams;
  const picked = flowAgent(q.agent);
  if (!picked) redirect("/start/roadmap");
  const key = picked.key as AgentKey;
  const C = COPY[key];
  const guided = GUIDED[key];
  const muse = key === "muse";

  const [agents, rules] = await Promise.all([agentsFor(session.person.id).list(), rulesFor(session.person.id).list()]);
  const hasRule = rules.some((r) => r.status === "active");
  const mine = agents.find((a) => a.status === "active" && a.type === picked.type);
  const waiting = agents.find((a) => a.status === "unassigned" && a.suggestedType === picked.type) ?? agents.find((a) => a.status === "unassigned" && a.suggestedType === null);
  const asked = STEPS.find((s) => s === q.step);
  const step: Step = asked ?? resumeStep(key, mine, hasRule);
  const here = (s?: Step | "confirm", extra = "") => `/start/setup?agent=${key}${s ? `&step=${s}` : ""}${extra}`;
  const summaryHref = (n: number) => here(step, `&summary=${n}`);

  const tag = muse ? (
    <div>
      <Tag strong>{COPY.muse.message?.tag}</Tag>
    </div>
  ) : null;
  const notice = muse ? <Banner tone="headsup">{MUSE_NOTICE}</Banner> : null;
  const hdr = (at: number, all?: boolean) => <StepHeader agent={key} at={at} all={all} summaryHref={summaryHref} />;
  const earlier = step === "intro" || step === "form" || step === "wait";

  // ---- the summary sheet over a finished step ----
  const n = Number(q.summary);
  const summary =
    n >= 1 && n <= 2 ? (
      <div className="onb-sheet-scrim">
        <div className="onb-sheet" role="dialog" aria-label={C.summary}>
          <span className="eyebrow">
            Progress {"·"} {n} Done
          </span>
          <h2>{n === 1 ? `${C.name} is connected as ${mine?.name ?? C.name}` : C.check.ok.title}</h2>
          <Link href={here(step)} prefetch={false} className="btn btn-block">
            Close
          </Link>
        </div>
      </div>
    ) : null;
  const wrap = (screen: React.ReactNode) => (
    <>
      {screen}
      {summary}
    </>
  );

  // ---- confirm and name (C4): an agent of this kind has signed in and is waiting ----
  if (waiting && (earlier || !mine)) {
    const sameKind = agents.find((a) => a.status === "active" && a.type === picked.type);
    const next = here(guided ? "instruction" : "check");
    return wrap(
      <OnbPage
        header={hdr(1)}
        actions={
          <Actions
            main={
              <button type="submit" form="confirm-form" className="btn-primary btn-block">
                {C.confirm.button}
              </button>
            }
            links={<Later />}
          />
        }
      >
        {tag}
        <Title mark={<StatusIcon kind="check" />} body={C.confirm.body}>
          {C.confirm.title}
        </Title>
        {notice}
        <form id="confirm-form" action={confirmAgent} className="field">
          <input type="hidden" name="id" value={waiting.id} />
          <input type="hidden" name="type" value={picked.type} />
          <input type="hidden" name="replaceId" value={sameKind?.id ?? ""} />
          <input type="hidden" name="next" value={next} />
          <label htmlFor="agent-name">{C.confirm.label}</label>
          <input id="agent-name" name="name" required maxLength={60} defaultValue={C.confirm.value} />
        </form>
        <p className="caption">{C.confirm.small}</p>
      </OnbPage>,
    );
  }

  // ---- intro (C1, G1) ----
  if (step === "intro" && guided && C.intro) {
    const I = C.intro;
    return wrap(
      <OnbPage
        header={hdr(1)}
        actions={
          <Actions
            main={
              <Link href={here("form")} prefetch={false} className="btn btn-primary btn-block">
                {I.next}
              </Link>
            }
            links={<Later />}
          />
        }
      >
        <Title body={I.body}>{I.title}</Title>
        <ol className="onb-ol">
          {I.list.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ol>
        {I.small ? <p className="strong-line">{I.small}</p> : null}
      </OnbPage>,
    );
  }

  // ---- form (C2, G2) and the one pasted message (K1, M1) ----
  if (step === "form" || step === "intro") {
    if (guided && C.form) {
      const F = C.form;
      return wrap(
        <ItemsScreen
          header={hdr(1)}
          top={<Title>{F.title}</Title>}
          lines={F.lines}
          items={F.items}
          linkId={OPEN_LINK[key]}
          openLabel={F.main}
          settledHref={here("wait")}
          middle={
            <>
              {F.choose ? (
                <div className="onb-choose">
                  <b>{F.choose}</b>
                  {F.options?.map(([a, b]) => (
                    <p key={b}>
                      {a}
                      <b>{b}</b>
                    </p>
                  ))}
                </div>
              ) : null}
              {F.steps ? (
                <div className="stack stack-1">
                  <span className="eyebrow">Steps in {C.name}</span>
                  <ol className="onb-ol">
                    {F.steps.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <p className="caption">{F.small}</p>
              <Disclosures
                items={[
                  { key: "shot", label: UI.showShot, content: <Shot label={F.shot} /> },
                  ...(F.link ? [{ key: "help", label: F.link, content: <p>{F.help}</p> }] : []),
                ]}
              />
            </>
          }
        />,
      );
    }
    const M = C.message;
    if (M) {
      return wrap(
        <OpenCopyScreen
          header={hdr(1)}
          top={
            <>
              {tag}
              <Title>{M.title}</Title>
              {notice}
            </>
          }
          lines={M.lines}
          text={M.msg}
          linkId={OPEN_LINK[key]}
          openLabel={M.main}
          goBackLabel={M.goBack}
          copyLabel={M.copy}
          settledHref={here("wait")}
        />,
      );
    }
  }

  // ---- waiting (C3, G3, K2, M2) ----
  if (step === "wait") {
    const W = C.wait;
    return wrap(
      <OnbPage header={hdr(1)} actions={<Actions links={<Later />} />}>
        {tag}
        <Title mark={<Clock />} body={W.body}>
          {W.title}
        </Title>
        {notice}
        <Disclosures
          items={[
            ...(guided ? [{ key: "again", label: UI.showDetails, href: here("intro") }] : []),
            ...(W.help
              ? [
                  {
                    key: "help",
                    label: W.help,
                    content: (
                      <>
                        <ul style={{ margin: 0, paddingLeft: 20 }}>
                          {W.list.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                        {key === "grok" ? (
                          <div className="onb-links">
                            <OutLink id="L8">Open Grok Bot connectors</OutLink>
                          </div>
                        ) : null}
                      </>
                    ),
                  },
                ]
              : []),
          ]}
        />
        <WatchForAgent />
      </OnbPage>,
    );
  }

  // Everything below needs the agent to be connected and confirmed.
  if (!mine) redirect(here(guided ? "intro" : "form"));

  // ---- instruction (C5, G5) ----
  if (step === "instruction" && guided && C.instr) {
    const I = C.instr;
    return wrap(
      <OpenCopyScreen
        header={hdr(2)}
        top={<Title body={I.body}>{I.title}</Title>}
        lines={I.lines}
        text={I.text}
        linkId={INSTR_LINK[key] as LinkId}
        openLabel={I.open}
        goBackLabel={I.goBack}
        copyLabel={I.copy}
        savedLabel={I.saved}
        savedHref={here("check")}
        bottom={
          <Disclosures items={[{ key: "shot", label: UI.showShot, content: <Shot label={I.shot} /> }]} />
        }
      />,
    );
  }

  // ---- check it works (C6, G6, K4, M6) ----
  if (step === "check" || step === "instruction") {
    return wrap(
      <CheckScreen
        agentId={mine.id}
        initial={{ firstGetRules: mine.calls.rules ? mine.calls.rules.toISOString() : null, firstLogTask: mine.calls.task ? mine.calls.task.toISOString() : null, status: "active" }}
        copy={C}
        chatLink={CHAT_LINK[key]}
        headerWaiting={hdr(2)}
        headerReady={hdr(3)}
        tag={tag}
        notice={notice}
        nextHref={here("rule")}
        instrLink={INSTR_LINK[key]}
        instrLabel={C.instr?.open}
      />,
    );
  }

  // ---- write your first rule (C7) ----
  if (step === "rule") {
    return wrap(<RuleStep agent={key} copy={C.rule} header={hdr(3)} top={<Title body={C.rule.body}>{C.rule.title}</Title>} error={q.error} />);
  }

  // ---- done (C8) ----
  return wrap(
    <OnbPage
      header={<StepHeader agent={key} at={3} all />}
      actions={
        <Actions
          main={
            <Link href="/" prefetch={false} className="btn btn-primary btn-block">
              {C.done.button}
            </Link>
          }
        />
      }
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/tomato-4-red.png" alt="" aria-hidden="true" width={72} height={72} />
      <Title body={C.done.body}>{C.done.title}</Title>
    </OnbPage>,
  );
}

