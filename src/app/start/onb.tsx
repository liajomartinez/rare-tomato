import Link from "next/link";
import type { ReactNode } from "react";
import { AGENT_LINKS, linkUrl, OUTBOUND, type LinkId } from "@/lib/agent-links";
import { RAILS, RAIL_LABEL, ROADMAP, STATE_WORDS, stepLabel, type AgentKey } from "@/lib/onboarding-copy";
import { StatusIcon } from "../ui";
import { doThisLater } from "./actions";

// The shared pieces of the round 9 onboarding. Plain markup and the token classes in globals.css only.

type RailState = "done" | "now" | "next";
const stateOf = (i: number, at: number, all?: boolean): RailState => (all || i + 1 < at ? "done" : i + 1 === at ? "now" : "next");

/** Header for screens before an agent is picked: the full logo and nothing else. */
export function LogoHeader() {
  return (
    <header className="onb-hdr">
      <div className="onb-hdr-in">
        <Link href="/" prefetch={false} aria-label="Rare Tomato">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="onb-logo" src="/brand/lockup-horizontal-trimmed.png" alt="Rare Tomato" />
        </Link>
      </div>
    </header>
  );
}

/**
 * The one compact header row: the tomato mark, a three-segment rail, and one label for the current step. Done, Now and Next are shown by shape and
 * position, and each segment has its state word and step name for screen readers. A finished step opens its short summary (`summaryHref`).
 */
export function RailBar({ agent, at, all, summaryHref }: { agent: AgentKey | "generic"; at: number; all?: boolean; summaryHref?: (n: number) => string }) {
  const steps = RAILS[agent === "generic" ? "claude" : agent];
  const title = steps[Math.min(at, 3) - 1][0];
  const label = all ? stepLabel(3, STATE_WORDS.done) : stepLabel(at, title);
  return (
        <nav className="onb-rail" aria-label={RAIL_LABEL}>
          <ol>
            {steps.map(([t], i) => {
              const s = stateOf(i, at, all);
              const inner = (
                <>
                  <span className="visually-hidden">
                    {STATE_WORDS[s]}: {t}
                  </span>
                  <span className="shape" aria-hidden="true">
                    {s === "done" ? (
                      <svg width="9" height="9" viewBox="0 0 10 10">
                        <path d="M1.5 5.3l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : null}
                    {s === "now" ? <span className="dot" /> : null}
                  </span>
                </>
              );
              return (
                <li key={t} className={`onb-seg is-${s}`} aria-current={s === "now" ? "step" : undefined}>
                  {s === "done" && summaryHref ? (
                    <Link href={summaryHref(i + 1)} prefetch={false}>
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ol>
          <p className="onb-step">{label}</p>
        </nav>
  );
}

/** The one compact header row: the tomato mark and the rail. */
export function StepHeader(props: { agent: AgentKey | "generic"; at: number; all?: boolean; summaryHref?: (n: number) => string }) {
  return (
    <header className="onb-hdr">
      <div className="onb-hdr-in">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="onb-mark" src="/brand/logo-mark.png" alt="Rare Tomato" />
        <RailBar {...props} />
      </div>
    </header>
  );
}

/** A header with the back arrow inside the row and the screen title beside it (sub-screens). */
export function BackHeader({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <header className="onb-hdr">
      <div className="onb-hdr-in">
        <Link href={href} prefetch={false} className="onb-back" aria-label={`Back to ${label}`}>
          <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
            <path d="M14 4l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
        <h1 className="onb-back-title">{children}</h1>
      </div>
    </header>
  );
}

/** The page: header, a column of content, then the action group under the content (it sticks to the bottom only when the content is taller than the screen). */
export function OnbPage({ header, children, actions }: { header: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="onb">
      {header}
      <main className="onb-main">{children}</main>
      {actions}
    </div>
  );
}

export function Title({ children, body, tag, mark }: { children: ReactNode; body?: string; tag?: ReactNode; mark?: ReactNode }) {
  return (
    <div className="stack stack-1">
      {tag}
      <h1 className="onb-title">
        {mark}
        {children}
      </h1>
      {body ? <p className="onb-body">{body}</p> : null}
    </div>
  );
}

/** The numbered lines. Round 12: only the current line is shown (bold, with its number); `at` is 1 to 3. With `at` 0 all three show, none bold. */
export function Lines({ lines, at = 0 }: { lines: readonly string[]; at?: number }) {
  return (
    <ol className="onb-lines">
      {lines.map((t, i) => (at !== 0 && at !== i + 1 ? null : (
        <li key={t} className={at === i + 1 ? "on" : undefined} aria-current={at === i + 1 ? "step" : undefined}>
          <span className="badge" aria-hidden="true">
            {i + 1}
          </span>
          <span className="txt">{t}</span>
        </li>
      )))}
    </ol>
  );
}

/** The message or instruction in its box. When copied, a tick and "Copied" show inside it. */
export function MsgBox({ text, copied }: { text: string; copied?: boolean }) {
  return (
    <div className="onb-msg">
      <span className="t">{text}</span>
      {copied ? (
        <span className="onb-copied" role="status">
          <StatusIcon kind="check" />
          Copied
        </span>
      ) : null}
    </div>
  );
}

/** The tick and "Copied" on its own line (used while the box itself is hidden). */
export function CopiedLine() {
  return (
    <span className="onb-copied" role="status">
      <StatusIcon kind="check" />
      Copied
    </span>
  );
}

/**
 * A link to another app, drawn as a button. Opens in a new tab with rel="noopener noreferrer". If the link has no address yet it draws NOTHING (no dead
 * button); in a dev build the gap is flagged in the console.
 */
export function OutLink({ id, kind = "quiet", children }: { id: LinkId; kind?: "primary" | "quiet"; children: ReactNode }) {
  const href = linkUrl(id);
  if (!href) return null;
  return (
    <a className={kind === "primary" ? "btn btn-primary btn-block" : "btn btn-quiet"} href={href} {...OUTBOUND} data-link-id={id} data-link-status={AGENT_LINKS[id].status}>
      {children}
    </a>
  );
}

/** "Do this later": remembers where the person got to and opens Home. */
export function Later() {
  return (
    <form action={doThisLater}>
      <button type="submit" className="btn-quiet">
        {ROADMAP.later}
      </button>
    </form>
  );
}

/** The action group: one main button, then small links. Without a main button it is only the links. */
export function Actions({ main, links }: { main?: ReactNode; links?: ReactNode }) {
  return (
    <div className={`onb-actions${main ? " has-main" : ""}`}>
      {main}
      {links ? <div className="onb-actions-row">{links}</div> : null}
    </div>
  );
}

export function Clock({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 5.4V10l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** A rail marker for the opened-out roadmap: Done (tick), Now (filled), Next (empty). Always with the word beside it. */
export function Mark({ s }: { s: RailState }) {
  return (
    <svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: "none" }}>
      {s === "done" ? (
        <>
          <circle cx="10" cy="10" r="9" fill="currentColor" />
          <path d="M5.8 10.4l2.9 2.9 5.5-6" fill="none" stroke="var(--rt-paper)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : null}
      {s === "now" ? (
        <>
          <circle cx="10" cy="10" r="8.2" fill="var(--rt-white)" stroke="currentColor" strokeWidth="2" />
          <circle cx="10" cy="10" r="4.4" fill="currentColor" />
        </>
      ) : null}
      {s === "next" ? <circle cx="10" cy="10" r="8.2" fill="none" stroke="var(--rt-ink-2)" strokeWidth="1.6" /> : null}
    </svg>
  );
}

/** The opened-out rail (roadmap and the Home card): each step with its marker, its word (Done, Now or Next), its name and one line. */
export function RailVertical({ agent = "claude", at = 1, all }: { agent?: AgentKey; at?: number; all?: boolean }) {
  const steps = RAILS[agent];
  const generic = RAILS.claude;
  return (
    <nav aria-label={RAIL_LABEL}>
      <ol className="onb-road">
        {steps.map(([t, d], i) => {
          const s = stateOf(i, at, all);
          const line = d ?? generic[i][1];
          return (
            <li key={t}>
              <div className="col">
                <Mark s={s} />
                {i < steps.length - 1 ? <span className="link" /> : null}
              </div>
              <div className="txt">
                <span className="eyebrow">{STATE_WORDS[s]}</span>
                <b>{t}</b>
                {agent === "claude" || agent === "chatgpt" || i === 2 ? <span className="d">{line}</span> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** A placeholder for a real screenshot, until Lia supplies one. */
export function Shot({ label }: { label: string }) {
  return (
    <div className="onb-shot" role="img" aria-label={label}>
      <b>{label}</b>
      <span className="caption">Placeholder. Swap for a real capture.</span>
    </div>
  );
}
