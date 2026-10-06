import type { TaskView } from "@/lib/tasks";
import type { ReactNode } from "react";
import { S } from "@/lib/strings";

// One entry in the feed. Everything on it is AGENT-REPORTED: it is what the agent chose to tell us.
// Agent text is shown as plain text only. It is never turned into links, markup or formatting.
// Layout (the design, SPEC B1): agent avatar, name and time, the "Agent-reported" tag, the text, then the two rating buttons.

const OUTCOME: Record<string, string> = { completed: "Completed", failed: "Did not work", needs_user: "Needs you" };

export const formatTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** Just the clock part, for a card under a "Today" or "Yesterday" heading. */
export const clockTime = (d: Date) => `${d.toISOString().slice(11, 16)} UTC`;

/** One row in the list: the agent's name in bold and the time on the right, the task sentence, a small gray line. No box around it; the page draws a line between rows. */
export function TaskCard({ task, children }: { task: TaskView; children?: ReactNode }) {
  return (
    <article id={`task-${task.id}`} className="flat-row stack stack-2" aria-label={`${task.agentName} did this`}>
      <div className="row row-between row-nowrap">
        <b style={{ font: "var(--font-name)" }}>{task.agentName}</b>
        <span className="caption" title={formatTime(task.occurredAt)}>
          {clockTime(task.occurredAt)}
        </span>
      </div>
      <p className="task-text">{task.summary}</p>
      <p className="caption">
        {task.category} · {task.outcome ? OUTCOME[task.outcome] : "No outcome reported"} · {S.agentReported}
      </p>
      {task.rulesConsulted.length > 0 ? <p className="caption">Rules it says it looked at: {task.rulesConsulted.join(", ")}</p> : null}
      {task.details ? (
        <details>
          <summary>More detail (as reported by the agent)</summary>
          <p style={{ whiteSpace: "pre-wrap" }}>{task.details}</p>
        </details>
      ) : null}
      {children}
    </article>
  );
}
