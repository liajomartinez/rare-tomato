import Link from "next/link";
import type { ReactNode } from "react";
import { S } from "@/lib/strings";
import { Logo } from "../ui";

// Small pieces the onboarding screens share (SPEC part A). They only use the classes in globals.css.

/** The bar with just the logo (no menu while someone is getting started). */
export function StartBar() {
  return (
    <header className="appbar">
      <Link href="/" prefetch={false} className="appbar-logo">
        <Logo />
      </Link>
    </header>
  );
}

/** The narrow single-column page every onboarding step uses. */
export function Narrow({ children }: { children: ReactNode }) {
  return (
    <>
      <StartBar />
      <main className="page-narrow">{children}</main>
    </>
  );
}

export function Head({ title, body, strong }: { title: string; body?: string; strong?: boolean }) {
  return (
    <div className="stack stack-3">
      <h1>{title}</h1>
      {body ? <p className={strong ? "strong-line" : "lead"}>{body}</p> : null}
    </div>
  );
}

/** "Step N of 3" with three bars. */
export function Progress({ n }: { n: number }) {
  return (
    <div className="stack stack-2">
      <div className="progress" role="img" aria-label={S.onb.stepOf(n)}>
        {[1, 2, 3].map((i) => (
          <i key={i} className={i <= n ? "on" : undefined} />
        ))}
      </div>
      <span className="eyebrow">{S.onb.stepOf(n)}</span>
    </div>
  );
}

export function BackLink({ href }: { href: string }) {
  return (
    <div>
      <Link href={href} prefetch={false} className="btn btn-quiet pull-left">
        {"←"} {S.onb.back}
      </Link>
    </div>
  );
}

/** "Claude · Step 2 of 3" with a segmented bar (SPEC narrow flow): the setup steps of one agent. */
export function StepBar({ label, n, of = 3 }: { label: string; n: number; of?: number }) {
  return (
    <div className="stack stack-2">
      <div className="progress" role="img" aria-label={`${label} · ${S.onb.stepOf(n, of)}`}>
        {Array.from({ length: of }, (_, i) => (
          <i key={i} className={i < n ? "on" : undefined} />
        ))}
      </div>
      <span className="eyebrow">
        {label} {"·"} {S.onb.stepOf(n, of)}
      </span>
    </div>
  );
}

/** The footer of a setup screen: a hairline, "Do this later" on the left, the completion action on the right. */
export function SetupFooter({ later, children }: { later: () => Promise<void>; children?: ReactNode }) {
  return (
    <div className="setup-footer">
      <form action={later}>
        <button type="submit" className="btn-quiet pull-left">
          {S.onb.later}
        </button>
      </form>
      {children}
    </div>
  );
}
