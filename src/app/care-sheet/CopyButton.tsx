"use client";

import { useEffect, useRef, useState } from "react";

// A button that copies a piece of text. The label flips to the "copied" word for a moment. If the browser refuses, the person is told to copy it by hand.
export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  primary = false,
  block = false,
  small = false,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  primary?: boolean;
  block?: boolean;
  small?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const cls = [primary ? "btn-primary" : "", block ? "btn-block" : "", small ? "btn-sm" : ""].filter(Boolean).join(" ");
  return (
    <>
      <button
        type="button"
        className={cls || undefined}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
            timer.current = setTimeout(() => setState("idle"), 1800);
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? `\u2713 ${copiedLabel}` : label}
      </button>
      <span role="status" className="caption">
        {state === "failed" ? "Could not copy. Select the text and copy it yourself." : ""}
      </span>
    </>
  );
}

/** A boxed piece of text with its copy button underneath (the starter line, the check question, the address). */
export function CopyBlock({ label, value, buttonLabel, copiedLabel, tight }: { label?: string; value: string; buttonLabel: string; copiedLabel?: string; tight?: boolean }) {
  return (
    <div className="stack stack-2">
      {label ? <span style={{ font: "var(--font-field-label)" }}>{label}</span> : null}
      <div className="copy-block">
        <span className={tight ? "list-text" : "copy-text"}>{value}</span>
        <div>
          <CopyButton text={value} label={buttonLabel} copiedLabel={copiedLabel} small />
        </div>
      </div>
    </div>
  );
}
