"use client";

import { useState } from "react";
import { button, primaryButton } from "../ui";

export function CopyButton({ text, label = "Copy", primary = false }: { text: string; label?: string; primary?: boolean }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <>
      <button
        type="button"
        className={primary ? "btn-primary" : undefined}
        style={primary ? primaryButton : button}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {label}
      </button>{" "}
      <span role="status">{state === "copied" ? "Copied." : state === "failed" ? "Could not copy. Select the text and copy it yourself." : ""}</span>
    </>
  );
}
