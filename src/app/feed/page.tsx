import { agentsFor, rulesFor, scoringFor, tasksFor } from "@/db/production";
import { TASK_CATEGORIES } from "@/lib/tasks";
import { requireReady } from "@/lib/session";
import { button, card, field, muted, Nav, Notice, page } from "../ui";
import { AGENT_MEMORY_NOTE, FEED_HEADING, FEED_NOTE, FEED_SUBLINE } from "@/lib/strings";
import { Checks } from "./Checks";
import { deleteTaskRecord } from "./actions";
import { FeedbackForm } from "./FeedbackForm";
import { TaskCard } from "./TaskCard";
import { logSafeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
// Drafting a rule calls a model, which can take a few seconds.
export const maxDuration = 45;

const PAGE_SIZE = 25;

export default async function Feed({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; category?: string; unreviewed?: string; before?: string; message?: string }>;
}) {
  const person = await requireReady();
  const q = await searchParams;
  await rulesFor(person.id).purgeExpiredDrafts().catch((error) => { logSafeError(error, "page:feed"); return 0; }); // drafts nobody decided on are deleted, not kept waiting
  const before = q.before && !Number.isNaN(Date.parse(q.before)) ? new Date(q.before) : undefined;
  const category = (TASK_CATEGORIES as readonly string[]).includes(q.category ?? "") ? q.category : undefined;

  const [agents, checks, tasks] = await Promise.all([
    agentsFor(person.id).list(),
    scoringFor(person.id).checks(),
    tasksFor(person.id).feed({
      connectionId: q.agent || undefined,
      category,
      notReviewed: q.unreviewed === "1",
      before,
      limit: PAGE_SIZE + 1,
      withDetails: true,
    }),
  ]);
  const shown = tasks.slice(0, PAGE_SIZE);
  const older = tasks.length > PAGE_SIZE ? shown[shown.length - 1].occurredAt.toISOString() : null;

  // Group by day (UTC), keeping the newest-first order.
  const days: { day: string; items: typeof shown }[] = [];
  for (const task of shown) {
    const day = task.occurredAt.toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(task);
    else days.push({ day, items: [task] });
  }

  const filterQuery = (extra: Record<string, string>) => {
    const params = new URLSearchParams();
    if (q.agent) params.set("agent", q.agent);
    if (category) params.set("category", category);
    if (q.unreviewed === "1") params.set("unreviewed", "1");
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return `/feed?${params.toString()}`;
  };

  return (
    <main style={page}>
      <Nav />
      <h1>{FEED_HEADING}</h1>
      <p>{FEED_SUBLINE}</p>
      {q.message ? <Notice>{q.message}</Notice> : null}
      <p style={muted}>{FEED_NOTE}</p>

      <form method="get" action="/feed" style={card}>
        <label>
          Agent
          <select name="agent" defaultValue={q.agent ?? ""} style={field}>
            <option value="">All agents</option>
            {agents.filter((a) => a.status === "active").map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Kind of task
          <select name="category" defaultValue={category ?? ""} style={field}>
            <option value="">All kinds</option>
            {TASK_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input type="checkbox" name="unreviewed" value="1" defaultChecked={q.unreviewed === "1"} /> Only ones I have not reviewed
        </label>
        <p>
          <button type="submit" style={button}>
            Show
          </button>
        </p>
      </form>

      {shown.length === 0 ? (
        <section style={card}>
          <h2>Nothing here yet</h2>
          <p>
            When one of your agents finishes a task, it can record it here. To connect one, go to <a href="/agents">Your agents</a>. After you confirm an agent,
            start a new chat in it and ask it to help with something.
          </p>
        </section>
      ) : null}

      {days.map(({ day, items }) => (
        <section key={day} aria-label={day}>
          <h2>{day}</h2>
          {items.map((task) => (
            <TaskCard key={task.id} task={task}>
              <Checks taskId={task.id} checks={checks.filter((c) => c.taskId === task.id)} />
              <FeedbackForm taskId={task.id} rating={task.rating} returnTo={filterQuery({})} />
              <form action={deleteTaskRecord} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="taskId" value={task.id} />
                <button type="submit" style={button}>Delete this record</button>
                <span style={muted}> {AGENT_MEMORY_NOTE}</span>
              </form>
            </TaskCard>
          ))}
        </section>
      ))}

      {older ? (
        <p>
          <a href={filterQuery({ before: older })}>Older</a>
        </p>
      ) : null}
    </main>
  );
}
