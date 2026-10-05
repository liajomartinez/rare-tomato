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
