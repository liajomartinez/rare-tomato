"use client";

import type { ReactNode } from "react";

// A primary button that opens another site (Claude) in a new tab and, a moment later, moves this page on to the next step,
// so the person finds the next instruction waiting when they come back.
export function ExternalThenGo({ href, next, children }: { href: string; next: string; children: ReactNode }) {
  return (
    <a
      className="btn btn-primary btn-block"
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => {
        setTimeout(() => window.location.assign(next), 400);
      }}
    >
      {children}
    </a>
  );
}
