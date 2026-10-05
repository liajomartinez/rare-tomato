"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { linkUrl, type LinkId } from "@/lib/agent-links";
import { currentLine, initialState, mainKind, reduce, type OpenCopyEvent, type Stage } from "@/lib/open-copy";
import { Actions, Later, Lines, MsgBox, OnbPage, OutLink } from "./onb";

// The open, then copy, then paste screens (round 9). The stage logic is in src/lib/open-copy.ts; this file is the browser side of it:
// it hears when the person leaves and comes back (page visibility and window focus) and does the copying.

/** Copies text with the clipboard API; if that is refused, tries the old way; returns false if both fail (the caller then shows the text to select). */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(el);
      return ok;
    } catch {
      return false;
    }
  }
}

/** Calls `left` when the page is hidden or loses focus, and `back` when it is visible or focused again. Each fires once per trip away. */
export function useAway(left: () => void, back: () => void) {
  const l = useRef(left);
  const b = useRef(back);
  useEffect(() => {
    l.current = left;
    b.current = back;
  });
  useEffect(() => {
    let away = false;
    const goAway = () => {
      if (away) return;
      away = true;
      l.current();
    };
    const comeBack = () => {
      if (!away) return;
      away = false;
      b.current();
    };
    const vis = () => (document.visibilityState === "hidden" ? goAway() : comeBack());
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);
    return () => {
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("blur", goAway);
      window.removeEventListener("focus", comeBack);
    };
  }, []);
}

/** Shown when the browser refused to copy: the text is selected for the person to copy by hand. */
const COPY_FAILED = "Could not copy. The text is selected: press and hold, or use Ctrl+C, to copy it yourself.";

export function CopyFailed() {
  return (
    <p className="caption" role="alert">
      {COPY_FAILED}
    </p>
  );
}

function selectAll(el: HTMLElement | null) {
  if (!el) return;
  const r = document.createRange();
  r.selectNodeContents(el);
  const s = window.getSelection();
  s?.removeAllRanges();
  s?.addRange(r);
}

/**
 * A screen with ONE thing to copy (Claude C5, ChatGPT G5, the check screens, Grok Bot and Muse connect). Three numbered lines, the box, and the action group
 * that changes with the stage. `settledHref`: where to go when the person comes back after copying and there is no stage 4 (the connect screens, which then
 * wait for the agent). `savedHref`: stage 4's "I've saved it" goes there (instruction screens).
 */
export function OpenCopyScreen(props: {
  header: ReactNode;
  top: ReactNode;
  lines: readonly string[];
  text: string;
  linkId: LinkId;
  openLabel: string;
  goBackLabel: string;
  copyLabel: string;
  savedLabel?: string;
  savedHref?: string;
  settledHref?: string;
  bottom?: ReactNode;
  /** Only for tests and screenshots: start at a later stage. */
  initialStage?: Stage;
}) {
  const hasStage4 = Boolean(props.savedLabel && props.savedHref);
  const router = useRouter();
  const [state, dispatch] = useReducer((s: typeof initialState, e: OpenCopyEvent) => reduce(s, e, { hasStage4 }), { ...initialState, stage: props.initialStage ?? 1 });
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const hasLink = Boolean(linkUrl(props.linkId));
  // A screen whose link has no address yet cannot start at "Open": Copy is the main button from the start.
  const stage = hasLink ? state.stage : state.stage === 1 ? 2 : state.stage;

  const settled = useRef(false);
  useAway(
    () => dispatch({ type: "left" }),
    () => {
      dispatch({ type: "back" });
      if (state.stage === 3 && !hasStage4 && props.settledHref && !settled.current) {
        settled.current = true;
        router.push(props.settledHref);
      }
    },
  );

  const copy = useCallback(async () => {
    const ok = await copyText(props.text);
    if (ok) {
      setFailed(false);
      dispatch({ type: "copied" });
    } else {
      setFailed(true);
      selectAll(box.current);
    }
  }, [props.text]);

  const kind = mainKind(stage);
  const copyBtn = (primary: boolean) => (
    <button type="button" className={primary ? "btn-primary btn-block" : "btn-quiet"} onClick={copy}>
      {props.copyLabel}
    </button>
  );

  let actions: ReactNode;
  if (kind === "open") {
    actions = <Actions main={<OutLink id={props.linkId} kind="primary">{props.openLabel}</OutLink>} links={<>{copyBtn(false)}<Later /></>} />;
  } else if (kind === "copy") {
    actions = (
      <Actions
        main={copyBtn(true)}
        links={
          <>
            <OutLink id={props.linkId}>{props.openLabel}</OutLink>
            <Later />
          </>
        }
      />
    );
  } else if (kind === "goBack") {
    actions = <Actions main={<OutLink id={props.linkId} kind="primary">{props.goBackLabel}</OutLink>} links={<Later />} />;
  } else {
    actions = (
      <Actions
        main={
          <Link href={props.savedHref as string} prefetch={false} className="btn btn-primary btn-block">
            {props.savedLabel}
          </Link>
        }
        links={<Later />}
      />
    );
  }

  return (
    <OnbPage header={props.header} actions={actions}>
      {props.top}
      <Lines lines={props.lines} at={currentLine(stage)} />
      <div ref={box} style={{ userSelect: "all" }}>
        <MsgBox text={props.text} copied={state.stage >= 3} />
      </div>
      {failed ? <CopyFailed /> : null}
      {props.bottom}
    </OnbPage>
  );
}

/** The Claude and ChatGPT form screens (C2, G2): Open stays the main button and each item has its own Copy beside it. No stages. */
export function ItemsScreen(props: {
  header: ReactNode;
  top: ReactNode;
  lines: readonly string[];
  items: { label: string; value: string; copy: string; where: string }[];
  linkId: LinkId;
  openLabel: string;
  middle?: ReactNode;
  bottom?: ReactNode;
  settledHref: string;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<string | null>(null);
  const all = copied.size === props.items.length;
  const going = useRef(false);
  const rows = useRef<Record<string, HTMLElement | null>>({});
  // Every item copied and the person is back from pasting them: the page waits for the agent to appear.
  const allRef = useRef(all);
  useEffect(() => {
    allRef.current = all;
  });
  useAway(
    () => {},
    () => {
      if (allRef.current && !going.current) {
        going.current = true;
        router.push(props.settledHref);
      }
    },
  );
  const line = copied.size === 0 ? 1 : all ? 3 : 2;
  return (
    <OnbPage
      header={props.header}
      actions={<Actions main={<OutLink id={props.linkId} kind="primary">{props.openLabel}</OutLink>} links={<Later />} />}
    >
      {props.top}
      <Lines lines={props.lines} at={copied.size === 0 ? 0 : line === 3 ? 3 : 2} />
      <div className="onb-items">
        {props.items.map((it) => (
          <div key={it.label} className="onb-item">
            <div className="onb-item-top">
              <div className="what">
                <span className="eyebrow">{it.label}</span>
                <b ref={(el) => void (rows.current[it.label] = el)}>{it.value}</b>
              </div>
              <button
                type="button"
                onClick={async () => {
                  const ok = await copyText(it.value);
                  if (ok) {
                    setFailed(null);
                    setCopied((c) => new Set(c).add(it.label));
                  } else {
                    setFailed(it.label);
                    selectAll(rows.current[it.label]);
                  }
                }}
              >
                {copied.has(it.label) ? "✓ Copied" : it.copy}
              </button>
            </div>
            <p className="caption" style={{ marginTop: "var(--space-2)" }}>
              {it.where}
            </p>
          </div>
        ))}
      </div>
      {failed ? <CopyFailed /> : null}
      {props.middle}
      {props.bottom}
    </OnbPage>
  );
}

/** Reloads the server part of the page about every 3 seconds while it waits for an agent to sign in, then stops when the page changes (the screen is replaced). */
export function WatchForAgent({ every = 3000 }: { every?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, every);
    return () => clearInterval(t);
  }, [router, every]);
  return null;
}
