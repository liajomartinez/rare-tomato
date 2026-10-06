import { agentsFor, rulesFor, scoringFor, tasksFor } from "@/db/production";
import { TASK_CATEGORIES } from "@/lib/tasks";
import { requireReady } from "@/lib/session";
import Link from "next/link";
import { BottomLink, Nav, Notice, PageSheet, Tabs } from "../ui";
import { AGENT_MEMORY_NOTE, MORE_FILTERS, MORE_ON_TASK, S } from "@/lib/strings";
import { Checks } from "./Checks";
import { deleteTaskRecord } from "./actions";
import { FeedbackForm } from "./FeedbackForm";
import { clockTime, TaskCard } from "./TaskCard";
import { logSafeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";
// Drafting a rule calls a model, which can take a few seconds.
export const maxDuration = 45;

/** The design shows the four newest first, then "Show N older" (SPEC B1, Q5: review fatigue). */
const FIRST_SHOWN = 4;
const MORE_STEP = 25;

const dayLabel = (day: string, now: Date) => {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return day === today ? S.feed.today : day === yesterday ? S.feed.yesterday : day;
};

export default async function Feed({
  searchParams,
}: {
  searchParams: Promise<{ agent?: string; category?: string; unreviewed?: string; show?: string; message?: string; sheet?: string }>;
}) {
  const person = await requireReady();
  const q = await searchParams;
  await rulesFor(person.id).purgeExpiredDrafts().catch((error) => { logSafeError(error, "page:feed"); return 0; }); // drafts nobody decided on are deleted, not kept waiting
  const category = (TASK_CATEGORIES as readonly string[]).includes(q.category ?? "") ? q.category : undefined;
  // "Not reviewed" is the default view; "All" is unreviewed=0.
  const onlyUnreviewed = q.unreviewed !== "0";
  const wanted = Math.min(Math.max(Number.parseInt(q.show ?? "", 10) || FIRST_SHOWN, FIRST_SHOWN), 500);
  const now = new Date();

  const [agents, checks, tasks, toReview] = await Promise.all([
    agentsFor(person.id).list(),
    scoringFor(person.id).checks(),
    tasksFor(person.id).feed({
      connectionId: q.agent || undefined,
      category,
      notReviewed: onlyUnreviewed,
      limit: wanted + MORE_STEP + 1,
      withDetails: true,
    }),
    tasksFor(person.id).reviewCount(),
  ]);
  const shown = tasks.slice(0, wanted);
  const olderCount = Math.min(tasks.length - shown.length, MORE_STEP);

  // Group by day (UTC), keeping the newest-first order.
  const days: { day: string; items: typeof shown }[] = [];
  for (const task of shown) {
    const day = task.occurredAt.toISOString().slice(0, 10);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(task);
    else days.push({ day, items: [task] });
  }

  const href = (extra: Record<string, string>, drop: string[] = []) => {
    const params = new URLSearchParams();
    if (q.agent) params.set("agent", q.agent);
    if (category) params.set("category", category);
    params.set("unreviewed", onlyUnreviewed ? "1" : "0");
    for (const [k, v] of Object.entries(extra)) params.set(k, v);
    for (const k of drop) params.delete(k);
    return `/feed?${params.toString()}`;
  };

  const sheetHref = href({ sheet: "about" });
  const closeHref = href({}, ["sheet"]);
  return (
    <>
      <Nav current="feed" />
      <main className="page-flat">
        <h1>{S.feed.title}</h1>
        <p className="caption">{S.feed.intro}</p>
        {q.message ? <Notice>{q.message}</Notice> : null}
        <Tabs
          label="Which tasks to show"
          items={[
            { label: S.feed.filterToReview(toReview), href: href({ unreviewed: "1" }, ["show"]), active: onlyUnreviewed },
            { label: S.feed.filterAll, href: href({ unreviewed: "0" }, ["show"]), active: !onlyUnreviewed },
          ]}
        />

        {shown.length === 0 ? (
          <p className="plain-line">
            Nothing to review. Tasks your agents report show up here.{" "}
            <Link href="/agents" prefetch={false} className="link-sm">
              {S.agents.title}
            </Link>
          </p>
        ) : null}

        {days.map(({ day, items }) => (
          <section key={day} aria-label={dayLabel(day, now)} className="flat">
            {days.length > 1 ? <p className="eyebrow">{dayLabel(day, now)}</p> : null}
            {items.map((task) => (
              <TaskCard key={task.id} task={task}>
                <Checks taskId={task.id} checks={checks.filter((c) => c.taskId === task.id)} />
                <FeedbackForm
                  taskId={task.id}
                  rating={task.rating}
                  returnTo={href({})}
                  context={{ agent: task.agentName, when: `${dayLabel(day, now).toLowerCase()} ${clockTime(task.occurredAt)}`, text: task.summary }}
                />
                <details>
                  <summary>{MORE_ON_TASK}</summary>
                  <form action={deleteTaskRecord} className="stack stack-2">
                    <input type="hidden" name="taskId" value={task.id} />
                    <div>
                      <button type="submit" className="btn-sm">
                        Delete this record
                      </button>
                    </div>
                    <p className="caption">{AGENT_MEMORY_NOTE}</p>
                  </form>
                </details>
              </TaskCard>
            ))}
          </section>
        ))}

        {olderCount > 0 ? (
          <Link className="link-sm" href={href({ show: String(wanted + MORE_STEP) })} prefetch={false}>
            {S.feed.showOlder(olderCount)}
          </Link>
        ) : null}

        <BottomLink href={sheetHref}>{S.feed.about}</BottomLink>
      </main>
      {q.sheet === "about" ? (
        <PageSheet title={S.feed.about} closeHref={closeHref}>
          <p className="caption">{S.feed.aboutNote}</p>
          <form method="get" action="/feed" className="stack stack-3">
            <input type="hidden" name="unreviewed" value={onlyUnreviewed ? "1" : "0"} />
            <p className="label-sm">{MORE_FILTERS}</p>
            <div className="field">
              <label htmlFor="agent">Agent</label>
              <select id="agent" name="agent" defaultValue={q.agent ?? ""}>
                <option value="">All agents</option>
                {agents.filter((a) => a.status === "active").map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="category">Kind of task</label>
              <select id="category" name="category" defaultValue={category ?? ""}>
                <option value="">All kinds</option>
                {TASK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary btn-block">
              Show
            </button>
          </form>
        </PageSheet>
      ) : null}
    </>
  );
}
