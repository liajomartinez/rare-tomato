import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PRODUCT_NAME, S } from "@/lib/strings";

// The shared look. Screens use the classes in globals.css; the style objects below are for the screens that are not designed yet
// (they keep their layout and take colors, type, cards and buttons from the tokens). Nothing here writes its own color, font, radius or shadow.

export const page: CSSProperties = { maxWidth: "var(--measure-legacy)", margin: "0 auto", padding: "0 var(--gutter) var(--space-5)" };
export const card: CSSProperties = {
  background: "var(--surface-card)",
  border: "var(--line-card)",
  borderRadius: "var(--radius-card)",
  padding: "var(--space-4) var(--space-4) 18px",
  margin: "var(--space-4) 0",
};
/** A card with an ink border (the design's emphasis for the new or primary card). */
export const cardNew: CSSProperties = { ...card, border: "var(--line-ink)" };
export const field: CSSProperties = { display: "block", width: "100%", margin: "var(--space-1) 0 var(--space-3)" };
/** A secondary button. The look comes from globals.css (a plain button is secondary); this only sets the height for small buttons. */
export const button: CSSProperties = { minHeight: "var(--target-min)" };
export const muted: CSSProperties = { color: "var(--text-secondary)", font: "var(--font-small)" };
/** Small caps labels such as "One step left" and "Connected". */
export const smallCaps: CSSProperties = {
  font: "var(--font-eyebrow)",
  letterSpacing: "var(--type-label-tracking)",
  textTransform: "uppercase",
  color: "var(--text-secondary)",
  margin: "var(--space-4) 0 var(--space-2)",
};

export type NavKey = "home" | "feed" | "rules" | "details" | "agents";
const PRIMARY_LINKS: { key: NavKey; href: string; label: string }[] = [
  { key: "home", href: "/", label: S.nav.home },
  { key: "feed", href: "/feed", label: S.nav.feed },
  { key: "rules", href: "/rules", label: S.nav.rules },
  { key: "details", href: "/profile", label: S.nav.details },
  { key: "agents", href: "/agents", label: S.nav.agents },
];

/** The logo, from the handoff's assets. */
export function Logo({ wide }: { wide?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/lockup-horizontal-trimmed.png" alt={PRODUCT_NAME} width={wide ? 284 : 236} height={wide ? 36 : 30} />;
}

/** The app bar. Phone: the logo and a Menu button that opens every link. Wide: the logo, five links, and a More button for the rest. */
export function Nav({ current }: { current?: NavKey }) {
  return (
    <header className="appbar">
      <Link href="/" prefetch={false} className="appbar-logo">
        <Logo />
      </Link>
      <nav aria-label="Main" className="nav-wide">
        {PRIMARY_LINKS.map((l) => (
          <Link key={l.key} href={l.href} prefetch={false} className="nav-link" aria-current={current === l.key ? "page" : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <details className="menu">
        <summary className="as-button btn-quiet">
          <span className="show-phone">{S.nav.menu}</span>
          <span className="show-wide">{S.nav.more}</span>
        </summary>
        <div className="menu-panel">
          {PRIMARY_LINKS.map((l) => (
            <Link key={l.key} href={l.href} prefetch={false} className="menu-primary" aria-current={current === l.key ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
          <Link href="/data" prefetch={false}>
            {S.nav.settings}
          </Link>
          {/* A plain link on purpose: the sign-out address must never be fetched ahead of time. */}
          <a href="/sign-out">{S.nav.signOut}</a>
        </div>
      </details>
    </header>
  );
}

/** Shows which account is signed in, so people with more than one Google account can tell (spec 11.3). */
export function SignedInAs({ email }: { email?: string | null }) {
  if (!email) return null;
  return (
    <p className="caption">
      Signed in as <strong>{email}</strong>. If you expected to see agents or details that are missing, you may have signed in with a different account.
    </p>
  );
}

export type Tone = "info" | "done" | "headsup" | "blocked";

export function StatusIcon({ kind = "info", label }: { kind?: "info" | "check" | "alert" | "outline"; label?: string }) {
  if (kind === "outline") {
    return (
      <svg className="status-icon status-icon-outline" viewBox="0 0 16 16" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8 7.2v4M8 4.6v.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const glyph = kind === "check" ? "✓" : kind === "alert" ? "!" : "i";
  const extra = kind === "check" ? " status-icon-done" : kind === "alert" ? " status-icon-alert" : "";
  return (
    <span className={`status-icon${extra}`} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {glyph}
    </span>
  );
}

const TONE_WORD: Record<Tone, string> = { info: "Note", done: "Done", headsup: "Heads-up", blocked: "Blocked" };

/** A banner. Always an icon plus a word for assistive tech, never color alone. */
export function Banner({ tone = "info", title, children, action }: { tone?: Tone; title?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${tone}`} role={tone === "blocked" ? "alert" : "status"}>
      <StatusIcon kind={tone === "done" ? "check" : tone === "info" ? "info" : "alert"} label={TONE_WORD[tone]} />
      <div>
        <p>
          {title ? <b>{title} </b> : null}
          {children}
        </p>
        {action}
      </div>
    </div>
  );
}

/** A message from a form action (Agent confirmed, Name saved, and so on). */
export function Notice({ children, urgent }: { children: ReactNode; urgent?: boolean }) {
  return (
    <Banner tone={urgent ? "headsup" : "info"}>
      {urgent ? "Please check: " : ""}
      {children}
    </Banner>
  );
}

export function Tag({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <span className={`tag${strong ? " tag-strong" : ""}`}>{children}</span>;
}

export function Sticker({ children }: { children: ReactNode }) {
  return <span className="sticker">{children}</span>;
}

export function AgentAvatar({ name, size }: { name: string; size?: "sm" | "md" }) {
  return (
    <span className={`avatar${size ? ` avatar-${size}` : ""}`} aria-hidden="true">
      {(name.trim()[0] || "?").toUpperCase()}
    </span>
  );
}

/** "Who can read your rules": the agents that can, as tags. */
export function WhoCanSee({ title, agents, note }: { title: string; agents: string[]; note?: string }) {
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      <div className="row">{agents.length ? agents.map((a) => <Tag key={a}>{a}</Tag>) : <span className="caption">No agents can see this.</span>}</div>
      {note ? <p className="caption">{note}</p> : null}
    </section>
  );
}

export function AppIcon() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="app-icon" src="/brand/app-icon.png" alt="" width={48} height={48} />;
}
