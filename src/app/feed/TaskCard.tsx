import type { TaskView } from "@/lib/tasks";
import type { ReactNode } from "react";
import { S } from "@/lib/strings";
import { AgentAvatar, StatusIcon } from "../ui";

// One entry in the feed. Everything on it is AGENT-REPORTED: it is what the agent chose to tell us.
// Agent text is shown as plain text only. It is never turned into links, markup or formatting.
// Layout (the design, SPEC B1): agent avatar, name and time, the "Agent-reported" tag, the text, then "Rate this task" with the two rating buttons.

const OUTCOME: Record<string, string> = { completed: "Completed", failed: "Did not work", needs_user: "Needs you" };

export const formatTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;
/** Just the clock part, for a card under a "Today" or "Yesterday" heading. */
export const clockTime = (d: Date) => `${d.toISOString().slice(11, 16)} UTC`;

/** `children` is where the page puts the feedback buttons, so this card stays plain and easy to test. */
export function TaskCard({ task, children }: { task: TaskView; children?: ReactNode }) {
  return (
    <article id={`task-${task.id}`} className="card card-roomy" aria-label={`${task.agentName} did this`}>
      <div className="task-top">
        <AgentAvatar name={task.agentName} size="sm" />
        <div className="stack stack-0 grow">
          <b style={{ font: "var(--font-name)" }}>{task.agentName}</b>
          <span className="caption" title={formatTime(task.occurredAt)}>
            {clockTime(task.occurredAt)}
          </span>
        </div>
        <span className="tag">
          <StatusIcon kind="outline" />
          {S.agentReported}
        </span>
      </div>
      <p className="task-text">{task.summary}</p>
      <p className="caption">
        {task.category} · {task.outcome ? OUTCOME[task.outcome] : "No outcome reported"}
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
