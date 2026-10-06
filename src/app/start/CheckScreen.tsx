"use client";

import Link from "next/link";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { LinkId } from "@/lib/agent-links";
import { linkUrl } from "@/lib/agent-links";
import type { AgentCopy } from "@/lib/onboarding-copy";
import { currentLine, initialState, mainKind, reduce, type OpenCopyEvent, type Stage } from "@/lib/open-copy";
import { checkState, NOT_SEEN_AFTER_MS, startPolling, type FetchResult, type PollStatus } from "@/lib/status-poll";
import { StatusIcon } from "../ui";
import { Clock, Actions, CopiedLine, Later, Lines, MsgBox, OnbPage, OutLink, Title } from "./onb";
import { CopyFailed, copyText, useAway } from "./OpenCopy";

// Check it works (Claude C6, ChatGPT G6, Grok Bot K4, Muse M6). The status comes from GET /agents/status?agent=<id>, which reads our own audit log, so
// "ready" means real calls reached our server. Polling is about every 3 seconds, only while waiting, and backs off on 429 (src/lib/status-poll.ts).

async function fetchStatus(agentId: string): Promise<FetchResult> {
  try {
    const res = await fetch(`/agents/status?agent=${encodeURIComponent(agentId)}`, { cache: "no-store", credentials: "same-origin" });
    if (res.status === 429) return { kind: "limited", retryAfterSeconds: Number(res.headers.get("retry-after")) || null };
    if (res.status === 401 || res.status === 404 || res.status === 307) return { kind: "gone" };
    if (!res.ok) return { kind: "error" };
    return { kind: "ok", status: (await res.json()) as PollStatus };
  } catch {
    return { kind: "error" };
  }
}

function Rows({ rows, states, waiting }: { rows: string[]; states: ("ok" | "wait" | "bad")[]; waiting: string }) {
  return (
    <div className="onb-waitrows" role="status">
      {rows.map((t, i) => (
        <div key={t} className="onb-waitrow">
          {states[i] === "ok" ? <StatusIcon kind="check" /> : states[i] === "bad" ? <StatusIcon kind="alert" /> : <Clock size={22} />}
          <b>{t}</b>
          {states[i] === "wait" ? <span className="w">{waiting}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function CheckScreen(props: {
  agentId: string;
  initial: Pick<PollStatus, "firstGetRules" | "firstLogTask" | "status">;
  copy: AgentCopy;
  /** The "start a new chat" link for this agent (L3, L6, L9 or L11). */
  chatLink: LinkId;
  /** Header for the waiting states (step 2) and for the ready state (step 3). */
  headerWaiting: ReactNode;
  headerReady: ReactNode;
  tag?: ReactNode;
  notice?: ReactNode;
  /** Where "Continue" goes (write your first rule). */
  nextHref: string;
  /** Where "Open <instructions>" goes in the not-seen list (Claude and ChatGPT only). */
  instrLink?: LinkId;
  instrLabel?: string;
  /** Only for tests and screenshots. */
  initialStage?: Stage;
  initialNotSeen?: boolean;
}) {
  const c = props.copy;
  const K = c.check;
  const [status, setStatus] = useState<PollStatus>({ ...props.initial });
  const [notSeen, setNotSeen] = useState(props.initialNotSeen ?? false);
  const [round, setRound] = useState(0); // "Check again" starts a new round
  const state = checkState(status);

  // Poll while waiting. Stops by itself when the answer is final.
  useEffect(() => {
    if (state === "ready" || status.status === "expired" || status.status === "revoked") return;
    const stop = startPolling({
      watching: "check",
      fetchStatus: () => fetchStatus(props.agentId),
      onStatus: (s) => setStatus(s),
    });
    return stop;
  }, [props.agentId, round, state, status.status]);

  // After about two minutes with no get_rules, say so.
  useEffect(() => {
    const t = setTimeout(() => setNotSeen(true), NOT_SEEN_AFTER_MS);
    return () => clearTimeout(t);
  }, [round]);

  const checkAgain = () => {
    setNotSeen(false);
    setRound((n) => n + 1);
  };

  // ---- ready ----
  if (state === "ready") {
    return (
      <OnbPage
        header={props.headerReady}
        actions={
          <Actions
            main={
              <Link href={props.nextHref} prefetch={false} className="btn btn-primary btn-block">
                {K.ok.button}
              </Link>
            }
          />
        }
      >
        <Title mark={<StatusIcon kind="check" />} body={K.ok.body}>
          {K.ok.title}
        </Title>
        <Rows rows={K.rows} states={["ok", "ok"]} waiting={K.waiting} />
      </OnbPage>
    );
  }

  // ---- almost there: rules read, task not reported ----
  if (state === "partial") {
    return <Partial {...props} states={["ok", "wait"]} />;
  }

  // ---- not seen yet ----
  if (notSeen) {
    return (
      <OnbPage
        header={props.headerWaiting}
        actions={
          <Actions
            main={
              <button type="button" className="btn-primary btn-block" onClick={checkAgain}>
                {K.none.button}
              </button>
            }
            links={<Later />}
          />
        }
      >
        <Title mark={<StatusIcon kind="alert" />} body={K.none.body}>
          {K.none.title}
        </Title>
        <ul className="stack stack-2" style={{ margin: 0, paddingLeft: 20, font: "var(--font-onb-line)" }}>
          {K.none.list.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="onb-links">
          {props.instrLink ? <OutLink id={props.instrLink}>{props.instrLabel}</OutLink> : null}
          <OutLink id={props.chatLink}>{K.open}</OutLink>
        </div>
        <Rows rows={K.rows} states={["wait", "wait"]} waiting={K.waiting} />
      </OnbPage>
    );
  }

  // ---- waiting: the three stages of open, then copy, then paste ----
  return <Waiting {...props} />;
}

function Waiting(props: Parameters<typeof CheckScreen>[0]) {
  const K = props.copy.check;
  const [state, dispatch] = useReducer((s: typeof initialState, e: OpenCopyEvent) => reduce(s, e, { hasStage4: false }), { ...initialState, stage: props.initialStage ?? 1 });
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useAway(
    () => dispatch({ type: "left" }),
    () => dispatch({ type: "back" }),
  );
  const copy = useCallback(async () => {
    const ok = await copyText(K.msg);
    if (ok) {
      setFailed(false);
      dispatch({ type: "copied" });
    } else {
      setFailed(true);
      const r = document.createRange();
      if (box.current) r.selectNodeContents(box.current);
      const s = window.getSelection();
      s?.removeAllRanges();
      s?.addRange(r);
    }
  }, [K.msg]);
  const hasLink = Boolean(linkUrl(props.chatLink));
  const stage = hasLink ? state.stage : state.stage === 1 ? 2 : state.stage;
  const kind = mainKind(stage);
  const copyBtn = (primary: boolean) => (
    <button type="button" className={primary ? "btn-primary btn-block" : "btn-quiet"} onClick={copy}>
      {K.copy}
    </button>
  );
  const actions =
    kind === "open" ? (
      <Actions main={<OutLink id={props.chatLink} kind="primary">{K.open}</OutLink>} links={<>{copyBtn(false)}<Later /></>} />
    ) : kind === "copy" ? (
      <Actions main={copyBtn(true)} links={<><OutLink id={props.chatLink}>{K.open}</OutLink><Later /></>} />
    ) : (
      <Actions main={<OutLink id={props.chatLink} kind="primary">{K.goBack}</OutLink>} links={<Later />} />
    );
  return (
    <OnbPage header={props.headerWaiting} actions={actions}>
      {props.tag}
      <Title>{K.title}</Title>
      {props.notice}
      <Lines lines={K.lines} at={currentLine(stage)} />
      {stage === 2 ? (
        <div ref={box} style={{ userSelect: "all" }}>
          <MsgBox text={K.msg} />
        </div>
      ) : null}
      {stage === 3 ? <CopiedLine /> : null}
      {failed ? <CopyFailed /> : null}
      <Rows rows={K.rows} states={["wait", "wait"]} waiting={K.waiting} />
    </OnbPage>
  );
}

/** Almost there: Copy message is the main button (the person is already in the chat). */
function Partial(props: Parameters<typeof CheckScreen>[0] & { states: ("ok" | "wait" | "bad")[] }) {
  const K = props.copy.check;
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  // L3b (Claude's open chat) has no address yet, so for Claude nothing is drawn; the other agents link to a new chat.
  const link: LinkId = props.copy.name === "Claude" ? "L3b" : props.chatLink;
  const openText = props.copy.name === "Claude" ? "Open Claude" : K.open;
  return (
    <OnbPage
      header={props.headerWaiting}
      actions={
        <Actions
          main={
            <button
              type="button"
              className="btn-primary btn-block"
              onClick={async () => {
                const ok = await copyText(K.part.msg);
                setFailed(!ok);
                setCopied(ok);
              }}
            >
              {copied ? `✓ Copied` : K.part.copy}
            </button>
          }
          links={
            <>
              <OutLink id={link}>{openText}</OutLink>
              <Later />
            </>
          }
        />
      }
    >
      {props.tag}
      <Title mark={<StatusIcon kind="info" />} body={K.part.body}>
        {K.part.title}
      </Title>
      {props.notice}
      <MsgBox text={K.part.msg} copied={copied} />
      {failed ? <CopyFailed /> : null}
      <Rows rows={K.rows} states={props.states} waiting={K.waiting} />
    </OnbPage>
  );
}
