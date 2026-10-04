import { agentsFor, feedbackFor, rulesFor, tasksFor } from "@/db/production";
import { whoCanSeeRule } from "@/lib/agents-view";
import { STRENGTHS, type RuleRecord } from "@/lib/rules";
import { requireReady } from "@/lib/session";
import { Banner, button, card, cardNew, field, muted, Nav, Notice, page, primaryButton, smallCaps } from "../ui";
import { ConflictPanel, hasContradiction, overlapsFor } from "./ConflictPanel";
import {
  AGENT_MEMORY_NOTE, AGENTS_CANNOT_SEE_DRAFT, DRAFT_GONE, DRAFT_HEADING, DRAFT_NOTE, EDIT_THEN_APPROVE, JUST_SAVED_ADVICE, JUST_SAVED_LABEL, justSavedFrom, NO_SAVED_RULES, NOT_NOW,
  OLD_PROPOSALS_HEADING, OLD_PROPOSALS_NOTE, RULES_HEADING, RULES_INTRO, SAVE_AS_RULE, savedRulesHeading, SEE_TASK_LINK, visibleTo,
} from "@/lib/strings";
import { approveRule, deleteRule, discardDraft, editRule, lockRule, resolveRule, retireRule } from "./actions";

export const dynamic = "force-dynamic";

const STRENGTH_LABEL: Record<string, string> = { prefer: "Prefer", always: "Always", never: "Never" };
const ruleTextStyle = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: "var(--size-card-title)", lineHeight: 1.2, whiteSpace: "pre-wrap", margin: "8px 0" } as const;
const fullWidth = { width: "100%", marginTop: 8 } as const;
const time = (d: Date) => `${d.toISOString().slice(0, 16).replace("T", " ")} UTC`;

function EditForm({ rule }: { rule: RuleRecord }) {
  return (
    <form action={editRule}>
      <input type="hidden" name="id" value={rule.id} />
      <label>
        The rule, in plain words
        <textarea name="text" defaultValue={rule.text} required maxLength={300} rows={3} style={field} />
      </label>
      <label>
        When it applies
        <input name="when" defaultValue={rule.when} required maxLength={200} style={field} />
      </label>
      <label>
        What the agent should do (optional)
        <input name="do" defaultValue={rule.do ?? ""} maxLength={300} style={field} />
      </label>
      <label>
        What the agent should not do (optional)
        <input name="dont" defaultValue={rule.dont ?? ""} maxLength={300} style={field} />
      </label>
      <label>
        How strong
        <select name="strength" defaultValue={rule.strength} style={field}>
          {STRENGTHS.map((s) => (
            <option key={s} value={s}>
              {STRENGTH_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" style={button}>
        Save as a new version and approve
      </button>
    </form>
  );
}

type Words = { taskId: string; note?: string; source?: "person" | "agent_reported" } | null;

/** The rule's own details (when it applies, how strong) in a small muted line, and where the person's own words came from. */
function Details({ rule, scope, words }: { rule: RuleRecord; scope: string; words?: Words }) {
  return (
    <>
      <p style={muted}>
        Applies to: {scope} · When: {rule.when}
        {rule.do ? <> · Do: {rule.do}</> : null}
        {rule.dont ? <> · Do not: {rule.dont}</> : null} · Strength: {STRENGTH_LABEL[rule.strength] ?? rule.strength}
      </p>
      {words ? (
        <>
          {words.source === "agent_reported" ? (
            <p style={muted}>
              Why it was proposed: <strong>your agent reported</strong> that you said{words.note ? <>: “{words.note}”</> : null}. This came from the agent, not from you, so please check it matches what you meant.
            </p>
          ) : words.note ? (
            <p style={muted}>In your words: “{words.note}”</p>
          ) : null}
          <p>
            <a href={`/feed#task-${words.taskId}`} style={{ display: "inline-block", minHeight: 44, lineHeight: "44px" }}>
              {SEE_TASK_LINK}
            </a>
          </p>
        </>
      ) : null}
    </>
  );
}

export default async function Rules({ searchParams }: { searchParams: Promise<{ message?: string; saved?: string; draft?: string }> }) {
  const person = await requireReady();
  const q = await searchParams;
  await rulesFor(person.id).purgeExpiredDrafts().catch(() => 0); // drafts nobody decided on are deleted, not kept waiting
  const [rules, agents] = await Promise.all([rulesFor(person.id).list(), agentsFor(person.id).list()]);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const scopeLabel = (s: string) => (s === "all" ? "all your agents" : `only ${agentName.get(s.replace("agent:", "")) ?? "one agent"}`);

  // The person's own words behind each proposal, for their eyes only, and where a saved rule came from.
  const fb = feedbackFor(person.id);
  const wordsFor = async (r: RuleRecord): Promise<Words> => {
    if (!r.sourceFeedbackId) return null;
    const f = await fb.getWithNote(r.sourceFeedbackId);
    return f ? { taskId: f.taskId, note: f.note, source: f.source } : null;
  };
  const originOf = async (r: RuleRecord): Promise<{ agent: string | null; when: string | null }> => {
    if (!r.sourceFeedbackId) return { agent: null, when: null };
    const f = await fb.getWithNote(r.sourceFeedbackId);
    if (!f) return { agent: null, when: null };
    const task = await tasksFor(person.id).get(f.taskId);
    return { agent: task ? agentName.get(task.connectionId) ?? null : null, when: time(f.createdAt) };
  };

  const newest = (a: RuleRecord, b: RuleRecord) => b.createdAt.getTime() - a.createdAt.getTime();
  const proposed = rules.filter((r) => r.status === "proposed").sort(newest);
  const live = rules.filter((r) => r.status === "active" || r.status === "locked").sort((a, b) => Number(b.status === "locked") - Number(a.status === "locked") || newest(a, b));
  const retired = rules.filter((r) => r.status === "retired").sort(newest);
  // Run 7: no queue of waiting drafts. The draft you were just sent here for is shown on its own; a draft you did not decide on is deleted after
  // about half an hour. Proposals with no expiry (an agent's reported correction, or drafted before run 7) are shown once, in their own section.
  const draft = q.draft ? proposed.find((r) => r.id === q.draft && r.draftExpiresAt !== null) : undefined;
  const older = proposed.filter((r) => r.draftExpiresAt === null);
  const draftWords = draft ? await wordsFor(draft) : null;
  const olderWords = await Promise.all(older.map(wordsFor));
  const justSaved = q.saved ? live.find((r) => r.id === q.saved) : undefined;
  const justSavedOrigin = justSaved ? await originOf(justSaved) : null;

  const proposal = (r: RuleRecord, words: Words) => {
    const overlaps = overlapsFor(r, rules);
    const blocked = hasContradiction(overlaps);
    return (
      <article key={r.id} id={`proposal-${r.id}`} style={cardNew} aria-label="Proposed rule">
        <p style={{ ...smallCaps, color: "var(--blue)", margin: 0 }}>{DRAFT_HEADING}</p>
        <p style={ruleTextStyle}>{r.text}</p>
        {r.because ? <p>{r.because}</p> : null}
        <Details rule={r} scope={scopeLabel(r.scope)} words={words} />
        <p>
          <strong>{AGENTS_CANNOT_SEE_DRAFT}</strong>
        </p>
        <p style={muted}>{DRAFT_NOTE}</p>
        <ConflictPanel rule={r} overlaps={overlaps} resolve={resolveRule} scopeLabel={scopeLabel} />
        {blocked ? (
          <p style={muted}>To save this rule, choose replace, keep both, or merge above. Or tap {NOT_NOW}.</p>
        ) : (
          <>
            <form action={approveRule}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="btn-primary" style={{ ...primaryButton, ...fullWidth }}>
                {SAVE_AS_RULE}
              </button>
            </form>
            <form action={approveRule}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="lock" value="yes" />
              <button type="submit" style={{ ...button, ...fullWidth }}>
                {SAVE_AS_RULE} and lock
              </button>
            </form>
          </>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "flex-start" }}>
          {blocked ? null : (
            <details style={{ flex: "1 1 160px" }}>
              <summary className="as-button" style={{ justifyContent: "center" }}>
                {EDIT_THEN_APPROVE}
              </summary>
              <EditForm rule={r} />
            </details>
          )}
          <form action={discardDraft} style={{ flex: "1 1 120px" }}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" style={{ ...button, width: "100%" }}>
              {NOT_NOW}
            </button>
          </form>
        </div>
        <p style={muted}>Locking makes a rule win over any other rule that overlaps it.</p>
      </article>
    );
  };

  return (
    <main style={page}>
      <Nav />
      <h1>{RULES_HEADING}</h1>
      <p style={muted}>{RULES_INTRO}</p>
      {q.message ? q.saved ? <Banner>{q.message}</Banner> : <Notice>{q.message}</Notice> : null}
      {justSaved ? (
        <section style={cardNew} aria-label="The rule you just saved">
          <p style={{ ...smallCaps, color: "var(--blue)", margin: 0 }}>{JUST_SAVED_LABEL}</p>
          <p style={ruleTextStyle}>{justSaved.text}</p>
          <p>{justSavedFrom(justSavedOrigin?.agent ?? null, justSavedOrigin?.when ?? null)}</p>
          <p>
            {visibleTo(whoCanSeeRule(agents, justSaved.scope))}. {JUST_SAVED_ADVICE}
          </p>
          <p>
            <a href={`#rule-${justSaved.id}`}>Go to it in your saved rules</a>
          </p>
        </section>
      ) : null}

      {q.draft && !draft ? <Notice>{DRAFT_GONE}</Notice> : null}
      {draft ? <section aria-label={DRAFT_HEADING}>{proposal(draft, draftWords)}</section> : null}

      {older.length > 0 ? (
        <section aria-label={OLD_PROPOSALS_HEADING}>
          <p style={smallCaps}>{OLD_PROPOSALS_HEADING}</p>
          <p style={muted}>{OLD_PROPOSALS_NOTE}</p>
          {older.map((r, i) => proposal(r, olderWords[i]))}
        </section>
      ) : null}

      <h2 style={{ marginTop: 24 }}>{savedRulesHeading(live.length)}</h2>
      {live.length === 0 ? <p style={muted}>{NO_SAVED_RULES}</p> : null}
      {live.map((r) => (
        <article
          key={r.id}
          id={`rule-${r.id}`}
          style={{ ...(r.id === q.saved ? cardNew : card), scrollMarginTop: "1rem" }}
          aria-label={r.status === "locked" ? "Locked rule" : "Active rule"}
        >
          <p style={muted}>
            {r.status === "locked" ? "Locked" : "Active"} · version {r.version}
            {r.approvedAt ? ` · approved ${r.approvedAt.toISOString().slice(0, 10)}` : ""}
          </p>
          <p style={{ fontWeight: 600, whiteSpace: "pre-wrap", margin: "4px 0" }}>{r.text}</p>
          <p style={muted}>{visibleTo(whoCanSeeRule(agents, r.scope))}</p>
          <Details rule={r} scope={scopeLabel(r.scope)} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {r.status === "active" ? (
              <form action={lockRule}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" style={button}>
                  Lock
                </button>
              </form>
            ) : null}
            <form action={retireRule}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" style={button}>
                Stop using this rule
              </button>
            </form>
          </div>
          <details>
            <summary>{EDIT_THEN_APPROVE}</summary>
            <EditForm rule={r} />
          </details>
          <form action={deleteRule} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" style={button}>
              Delete this rule
            </button>
            <span style={muted}> {AGENT_MEMORY_NOTE}</span>
          </form>
        </article>
      ))}

      {retired.length > 0 ? (
        <details>
          <summary>Earlier versions and turned-down rules ({retired.length})</summary>
          {retired.map((r) => (
            <article key={r.id} style={card} aria-label="Retired rule">
              <p style={muted}>Version {r.version} · not shown to any agent</p>
              <p style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{r.text}</p>
              <Details rule={r} scope={scopeLabel(r.scope)} />
              <form action={deleteRule} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" style={button}>
                  Delete this rule
                </button>
                <span style={muted}> {AGENT_MEMORY_NOTE}</span>
              </form>
            </article>
          ))}
        </details>
      ) : null}
    </main>
  );
}
