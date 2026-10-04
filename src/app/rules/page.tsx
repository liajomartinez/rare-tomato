import { agentsFor, feedbackFor, rulesFor } from "@/db/production";
import { STRENGTHS, type RuleRecord } from "@/lib/rules";
import { requireReady } from "@/lib/session";
import { button, card, field, muted, Nav, Notice, page } from "../ui";
import { ConflictPanel, hasContradiction, overlapsFor } from "./ConflictPanel";
import { AGENT_MEMORY_NOTE, DRAFT_GONE, DRAFT_HEADING, DRAFT_NOTE, OLD_PROPOSALS_HEADING, OLD_PROPOSALS_NOTE, RULES_INTRO, SAVE_AS_RULE } from "@/lib/strings";
import { approveRule, deleteRule, discardDraft, editRule, lockRule, resolveRule, retireRule } from "./actions";
import { logSafeError } from "@/lib/safe-log";

export const dynamic = "force-dynamic";

const STRENGTH_LABEL: Record<string, string> = { prefer: "Prefer", always: "Always", never: "Never" };

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

function Details({ rule, scope, words }: { rule: RuleRecord; scope: string; words?: { taskId: string; note?: string; source?: "person" | "agent_reported" } | null }) {
  return (
    <>
      <p style={{ whiteSpace: "pre-wrap", fontSize: "1.1rem" }}>{rule.text}</p>
      <ul style={muted}>
        <li>Applies to: {scope}</li>
        <li>When: {rule.when}</li>
        {rule.do ? <li>Do: {rule.do}</li> : null}
        {rule.dont ? <li>Do not: {rule.dont}</li> : null}
        <li>Strength: {STRENGTH_LABEL[rule.strength] ?? rule.strength}</li>
        {rule.status === "proposed" && rule.because ? <li>Why: {rule.because}</li> : null}
      </ul>
      {words ? (
        <>
        <p style={muted}>
          {words.source === "agent_reported" ? (
            <>
              Why it was proposed: <strong>your agent reported</strong> that you said{words.note ? <>: “{words.note}”</> : null}. This came from the agent, not from you, so please check it matches what you meant.{" "}
            </>
          ) : (
            <>
              Why it was proposed: your feedback{words.note ? <>, in your words: “{words.note}”</> : null}.{" "}
            </>
          )}
        </p>
        <p>
          <a href={`/feed#task-${words.taskId}`} style={{ display: "inline-block", minHeight: 44, lineHeight: "44px" }}>
            See the task and feedback it came from
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
  await rulesFor(person.id).purgeExpiredDrafts().catch((error) => { logSafeError(error, "page:rules"); return 0; }); // drafts nobody decided on are deleted, not kept waiting
  const [rules, agents] = await Promise.all([rulesFor(person.id).list(), agentsFor(person.id).list()]);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const scopeLabel = (s: string) => (s === "all" ? "all your agents" : `only ${agentName.get(s.replace("agent:", "")) ?? "one agent"}`);

  // The person's own words behind each proposal, for their eyes only.
  const fb = feedbackFor(person.id);
  const wordsFor = async (r: RuleRecord) => {
    if (!r.sourceFeedbackId) return null;
    const f = await fb.getWithNote(r.sourceFeedbackId);
    return f ? { taskId: f.taskId, note: f.note, source: f.source } : null;
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

  const proposal = (r: RuleRecord, words: Awaited<ReturnType<typeof wordsFor>>) => {
    const overlaps = overlapsFor(r, rules);
    const blocked = hasContradiction(overlaps);
    return (
      <article key={r.id} id={`proposal-${r.id}`} style={{ ...card, borderWidth: 3 }} aria-label="Proposed rule">
        <Details rule={r} scope={scopeLabel(r.scope)} words={words} />
        <ConflictPanel rule={r} overlaps={overlaps} resolve={resolveRule} scopeLabel={scopeLabel} />
        <div>
          {blocked ? (
            <p style={muted}>To save this rule, choose replace, keep both, or merge above. Or tap Not now.</p>
          ) : (
            <>
              <form action={approveRule} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" style={button}>
                  {SAVE_AS_RULE}
                </button>
              </form>{" "}
              <form action={approveRule} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="lock" value="yes" />
                <button type="submit" style={button}>
                  {SAVE_AS_RULE} and lock
                </button>
              </form>{" "}
            </>
          )}
          <form action={discardDraft} style={{ display: "inline" }}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" style={button}>
              Not now
            </button>
          </form>
        </div>
        <p style={muted}>Locking makes a rule win over any other rule that overlaps it.</p>
        {blocked ? null : (
          <details>
            <summary>Edit, then approve</summary>
            <EditForm rule={r} />
          </details>
        )}
      </article>
    );
  };

  return (
    <main style={page}>
      <Nav />
      <h1>Your rules</h1>
      <p>{RULES_INTRO}</p>
      {q.message ? <Notice>{q.message}</Notice> : null}
      {justSaved ? (
        <section style={{ ...card, borderWidth: 3 }} aria-label="The rule you just saved">
          <p style={muted}>The rule you just saved. It moved down into the list of rules your agents can see: <a href={`#rule-${justSaved.id}`}>go to it</a>.</p>
          <p style={{ whiteSpace: "pre-wrap", fontSize: "1.1rem" }}>{justSaved.text}</p>
        </section>
      ) : null}

      {q.draft && !draft ? <Notice>{DRAFT_GONE}</Notice> : null}
      {draft ? (
        <section aria-label={DRAFT_HEADING}>
          <h2>{DRAFT_HEADING}</h2>
          <p style={muted}>{DRAFT_NOTE}</p>
          {proposal(draft, draftWords)}
        </section>
      ) : null}

      {older.length > 0 ? (
        <section aria-label={OLD_PROPOSALS_HEADING}>
          <h2>{OLD_PROPOSALS_HEADING}</h2>
          <p style={muted}>{OLD_PROPOSALS_NOTE}</p>
          {older.map((r, i) => proposal(r, olderWords[i]))}
        </section>
      ) : null}

      <h2>Rules your agents can see</h2>
      {live.length === 0 ? <p style={muted}>None yet. No agent sees a rule until you approve one.</p> : null}
      {live.map((r) => (
        <article
          key={r.id}
          id={`rule-${r.id}`}
          style={r.id === q.saved ? { ...card, borderWidth: 3, scrollMarginTop: "1rem" } : { ...card, scrollMarginTop: "1rem" }}
          aria-label={r.status === "locked" ? "Locked rule" : "Active rule"}
        >
          <p style={muted}>
            {r.status === "locked" ? "🔒 Locked" : "Active"} · version {r.version}
            {r.approvedAt ? ` · approved ${r.approvedAt.toISOString().slice(0, 10)}` : ""}
          </p>
          <Details rule={r} scope={scopeLabel(r.scope)} />
          <div>
            {r.status === "active" ? (
              <form action={lockRule} style={{ display: "inline" }}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" style={button}>
                  Lock
                </button>
              </form>
            ) : null}{" "}
            <form action={retireRule} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" style={button}>
                Stop using this rule
              </button>
            </form>
          </div>
          <details>
            <summary>Edit, then approve</summary>
            <EditForm rule={r} />
          </details>
          <form action={deleteRule} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" style={button}>Delete this rule</button>
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
              <Details rule={r} scope={scopeLabel(r.scope)} />
              <form action={deleteRule} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" style={button}>Delete this rule</button>
              <span style={muted}> {AGENT_MEMORY_NOTE}</span>
            </form>
            </article>
          ))}
        </details>
      ) : null}
    </main>
  );
}
