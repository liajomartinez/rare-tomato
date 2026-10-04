"use client";

import { useState } from "react";
import { button } from "../ui";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <>
      <button
        type="button"
        style={button}
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
