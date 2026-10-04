import type { TaskView } from "@/lib/tasks";
import type { ReactNode } from "react";
import { card, muted } from "../ui";

// One entry in the feed. Everything on it is AGENT-REPORTED: it is what the agent chose to tell us.
// Agent text is shown as plain text only. It is never turned into links, markup or formatting.
// Layout (the design): agent name and time on one line, the task title at 16px bold, the short detail, then the rating buttons.

const OUTCOME: Record<string, string> = { completed: "Completed", failed: "Did not work", needs_user: "Needs you" };

export const formatTime = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** `children` is where the page puts the feedback buttons, so this card stays plain and easy to test. */
export function TaskCard({ task, children }: { task: TaskView; children?: ReactNode }) {
  return (
    <article id={`task-${task.id}`} style={card} aria-label={`${task.agentName} did this`}>
      <p style={{ ...muted, margin: 0 }}>
        <strong style={{ color: "var(--ink)" }}>{task.agentName}</strong> · {formatTime(task.occurredAt)}
      </p>
      <h3 style={{ fontFamily: "var(--font-body)", fontSize: 16, fontWeight: 600, whiteSpace: "pre-wrap", margin: "6px 0" }}>{task.summary}</h3>
      <p style={muted}>
        {task.category} · {task.outcome ? OUTCOME[task.outcome] : "No outcome reported"} · <strong>agent-reported</strong>
      </p>
      {task.rulesConsulted.length > 0 ? <p style={muted}>Rules it says it looked at: {task.rulesConsulted.join(", ")}</p> : null}
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
