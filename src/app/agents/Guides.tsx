import { GUIDES } from "@/lib/agent-guides";
import { CARE_SHEET_NAME_LOWER } from "@/lib/strings";
import { card, muted } from "../ui";

// Per-agent connection guides on Your agents (SPEC 11.5). The words live in src/lib/agent-guides.ts; longer versions are in docs/guides/.
export function Guides({ address }: { address: string }) {
  return (
    <section aria-label="How to connect each agent">
      <h2>How to connect each agent</h2>
      <p style={muted}>The address to use is <code>{address}</code>. Menu names change from time to time, so yours may look a little different.</p>
      {GUIDES.map((g) => (
        <details key={g.id} style={card}>
          <summary>
            <strong>{g.name}</strong> {g.mode === "care_sheet" ? `(${CARE_SHEET_NAME_LOWER} only)` : ""}
          </summary>
          <ol>
            {g.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <p>
            <strong>What to expect</strong>
          </p>
          <ul>
            {g.expect.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>
            <strong>Honest limits</strong>
          </p>
          <ul>
            {g.limits.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      ))}
    </section>
  );
}
