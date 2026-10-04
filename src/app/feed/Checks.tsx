import type { CheckView } from "@/lib/scoring/run";
import { AGENT_REPORTED } from "@/lib/strings";
import { button, muted } from "../ui";
import { answerCheck } from "./actions";

// What the rules check said about one task (spec 6.5). Advisory: it never changes what the agent did. The verdict is about the agent's
// own report ("agent-reported"), made by a best-effort scorer, and it can be wrong. When no scorer could decide, the person decides.

const WORDS: Record<string, string> = { followed: "looks followed", violated: "looks broken", not_applicable: "does not apply", uncertain: "could not be decided" };
const WHO: Record<string, string> = { claude: "Claude Haiku", jev: "Jev", user: "you" };

export function Checks({ taskId, checks }: { taskId: string; checks: CheckView[] }) {
  if (checks.length === 0) return null;
  return (
    <div aria-label="How this task compared with your rules">
      <h4>Compared with your rules ({AGENT_REPORTED}, best-effort)</h4>
      <ul>
        {checks.map((c) => (
          <li key={c.ruleId}>
            <span style={{ whiteSpace: "pre-wrap" }}>{c.ruleText}</span>: <strong>{WORDS[c.verdict]}</strong> <span style={muted}>(by {WHO[c.scorer]})</span>
            {c.needsAnswer ? (
              <form action={answerCheck} style={{ display: "block", marginTop: "0.25rem" }}>
                <input type="hidden" name="taskId" value={taskId} />
                <input type="hidden" name="ruleId" value={c.ruleId} />
                <span>Was this right? </span>
                <button type="submit" name="verdict" value="followed" style={button}>It followed the rule</button>{" "}
                <button type="submit" name="verdict" value="violated" style={button}>It broke the rule</button>{" "}
                <button type="submit" name="verdict" value="not_applicable" style={button}>Does not apply</button>
              </form>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
