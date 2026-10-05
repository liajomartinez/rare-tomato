import type { ReactNode } from "react";
import { linkFor, type LinkKey } from "@/lib/strings";
import { S, AGENT_INSTRUCTION } from "@/lib/strings";
import { CopyButton } from "../care-sheet/CopyButton";

// Pieces the setup screens share (Finish setup on Your agents, and the first-login setup). Plain markup and the token classes only.

/** An "Open ___" button. Shown only when the design gave a link for it (nothing is guessed); opens in a new tab. */
export function OpenButton({ linkKey, children, primary }: { linkKey: LinkKey; children: ReactNode; primary?: boolean }) {
  const href = linkFor(linkKey);
  if (!href) return null;
  return (
    <a className={`btn btn-block${primary ? " btn-primary" : ""}`} href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/** The standing instruction in its box, the guidance line, and "Copy instruction". The text is the one constant in strings.ts. */
export function InstructionBlock({ primaryCopy = true }: { primaryCopy?: boolean }) {
  const I = S.onb.setup.instr;
  return (
    <div className="stack stack-3">
      <div className="copy-box">{AGENT_INSTRUCTION}</div>
      <p className="strong-line">{I.guidance}</p>
      <CopyButton text={AGENT_INSTRUCTION} label={I.copy} copiedLabel={S.onb.setup.copied} primary={primaryCopy} block />
    </div>
  );
}

/** "Show me where": a disclosure with numbered steps and, optionally, a fallback path (kept as data in strings.ts). */
export function ShowWhere({ steps, intro, paths }: { steps?: readonly string[]; intro?: string; paths?: readonly string[] }) {
  return (
    <details>
      <summary>
        <span className="swap">
          <span className="on-closed">{S.onb.setup.showWhere}</span>
          <span className="on-open">{S.onb.setup.hideWhere}</span>
        </span>
      </summary>
      <div className="stack stack-3" style={{ marginTop: "var(--space-3)" }}>
        {intro ? <p className="caption">{intro}</p> : null}
        {paths?.map((p) => (
          <p key={p} className="strong-line">
            {p}
          </p>
        ))}
        {steps ? (
          <ol className="steps">
            {steps.map((s) => (
              <li key={s}>
                <span className="step-text">{s}</span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </details>
  );
}
