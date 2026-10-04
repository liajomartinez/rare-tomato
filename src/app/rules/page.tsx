import { agentsFor, feedbackFor, rulesFor, tasksFor } from "@/db/production";
import { whoCanSeeRule } from "@/lib/agents-view";
import { REASONS } from "@/lib/feedback-reasons";
import { STRENGTHS, type RuleRecord } from "@/lib/rules";
import { requireReady } from "@/lib/session";
import { Banner, Nav, Notice, SignedInAs, Sticker, Tag, WhoCanSee } from "../ui";
import { ConflictPanel, hasContradiction, overlapsFor } from "./ConflictPanel";
import { AGENT_MEMORY_NOTE, DRAFT_GONE, EDIT_THEN_APPROVE, NOT_NOW, OLD_PROPOSALS_HEADING, OLD_PROPOSALS_NOTE, S, SAVE_AS_RULE } from "@/lib/strings";
import { approveRule, deleteRule, discardDraft, editRule, lockRule, resolveRule, retireRule } from "./actions";

export const dynamic = "force-dynamic";

const STRENGTH_LABEL: Record<string, string> = { prefer: "Prefer", always: "Always", never: "Never" };
const reasonLabel = (code: string) => REASONS.find((r) => r.code === code)?.label ?? code;
const time = (d: Date, now = new Date()) => {
  const day = d.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  return `${day === today ? "today" : day === yesterday ? "yesterday" : day} ${d.toISOString().slice(11, 16)} UTC`;
};
const day = (d: Date) => d.toISOString().slice(0, 10);

function EditForm({ rule }: { rule: RuleRecord }) {
  return (
    <form action={editRule} className="card stack stack-3">
      <input type="hidden" name="id" value={rule.id} />
      <div className="field">
        <label htmlFor={`text-${rule.id}`}>The rule, in plain words</label>
        <textarea id={`text-${rule.id}`} name="text" defaultValue={rule.text} required maxLength={300} rows={3} />
      </div>
      <div className="field">
        <label htmlFor={`when-${rule.id}`}>When it applies</label>
        <input id={`when-${rule.id}`} name="when" defaultValue={rule.when} required maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor={`do-${rule.id}`}>What the agent should do (optional)</label>
        <input id={`do-${rule.id}`} name="do" defaultValue={rule.do ?? ""} maxLength={300} />
      </div>
      <div className="field">
        <label htmlFor={`dont-${rule.id}`}>What the agent should not do (optional)</label>
        <input id={`dont-${rule.id}`} name="dont" defaultValue={rule.dont ?? ""} maxLength={300} />
      </div>
      <div className="field">
        <label htmlFor={`strength-${rule.id}`}>How strong</label>
        <select id={`strength-${rule.id}`} name="strength" defaultValue={rule.strength}>
          {STRENGTHS.map((s) => (
            <option key={s} value={s}>
              {STRENGTH_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <button type="submit" className="btn-sm">
          Save as a new version and approve
        </button>
      </div>
    </form>
  );
}

type Words = { taskId: string; note?: string; source?: "person" | "agent_reported"; reasons: string[]; agent: string | null; when: string | null } | null;

/** The rule's own details (when it applies, how strong) in a small caption. */
function Details({ rule, scope }: { rule: RuleRecord; scope: string }) {
  return (
    <p className="caption">
      Applies to: {scope} · When: {rule.when}
      {rule.do ? <> · Do: {rule.do}</> : null}
      {rule.dont ? <> · Do not: {rule.dont}</> : null} · Strength: {STRENGTH_LABEL[rule.strength] ?? rule.strength}
    </p>
  );
}

function WhoRow({ label, names }: { label: string; names: string[] }) {
  return (
    <div className="stack stack-2">
      <span className="label-sm">{label}</span>
      <div className="row row-tight">{names.length ? names.map((a) => <Tag key={a}>{a}</Tag>) : <span className="caption">No agent can read rules right now.</span>}</div>
    </div>
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
    if (!f) return null;
    const task = await tasksFor(person.id).get(f.taskId);
    return { taskId: f.taskId, note: f.note, source: f.source, reasons: f.reasonCodes.map(reasonLabel), agent: task ? agentName.get(task.connectionId) ?? null : null, when: time(f.createdAt) };
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
  // The just-saved rule is highlighted at the top of the list.
  const listed = justSaved ? [justSaved, ...live.filter((r) => r.id !== justSaved.id)] : live;
  const readers = (scope: string) => whoCanSeeRule(agents, scope);

  // The new rule (not saved yet). The designed draft has ONE button: Save as a rule (UX-1 revision 1). An older proposal (not designed) keeps Not now.
  const proposal = (r: RuleRecord, words: Words, designed: boolean) => {
    const overlaps = overlapsFor(r, rules);
    const blocked = hasContradiction(overlaps);
    return (
      <section key={r.id} id={`proposal-${r.id}`} className="card card-dashed stack" aria-label={S.rules.draftHeading}>
        <p className="eyebrow">{S.rules.draftHeading}</p>
        <p className="rule-text">{r.text}</p>
        <div className="stack stack-3">
          {words ? (
            <>
              <div className="stack stack-2">
                <span className="label-sm">{S.rules.fromHeading}</span>
                {words.source === "agent_reported" ? (
                  <span className="caption">
                    Your agent reported that you said this{words.note ? <>: “{words.note}”</> : null}. This came from the agent, not from you, so please check it matches what you meant.
                  </span>
                ) : (
                  <span className="caption">{S.rules.fromReason(words.agent ?? "an agent", words.when ?? "")}</span>
                )}
              </div>
              {words.reasons.length > 0 ? (
                <div className="row row-tight">
                  {words.reasons.map((x) => (
                    <Tag key={x}>{x}</Tag>
                  ))}
                </div>
              ) : null}
              {words.note ? (
                <p className="caption">
                  <b>{S.rules.yourNote}:</b> “{words.note}”
                </p>
              ) : words.source !== "agent_reported" ? (
                <p className="caption">{S.rules.reasonOnly}</p>
              ) : null}
              <a className="link" href={`/feed#task-${words.taskId}`}>
                {S.rules.seeSource}
              </a>
            </>
          ) : null}
          {designed ? null : r.because ? <p className="caption">{r.because}</p> : null}
          {designed ? null : <Details rule={r} scope={scopeLabel(r.scope)} />}
        </div>
        <ConflictPanel rule={r} overlaps={overlaps} resolve={resolveRule} scopeLabel={scopeLabel} />
        <div className="stack rule-above">
          {blocked ? (
            <p className="caption">To save this rule, choose replace, keep both, or merge above.</p>
          ) : (
            <form action={approveRule}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className={designed ? "btn-primary btn-block" : "btn-block"}>
                {SAVE_AS_RULE}
              </button>
            </form>
          )}
          <p className="caption">{S.rules.draftNote}</p>
          {designed ? null : (
            <div className="row">
              {blocked ? null : (
                <details>
                  <summary className="as-button">{EDIT_THEN_APPROVE}</summary>
                  <EditForm rule={r} />
                </details>
              )}
              <form action={discardDraft}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit">{NOT_NOW}</button>
              </form>
            </div>
          )}
        </div>
        <WhoRow label={S.rules.wouldSee} names={readers(r.scope)} />
      </section>
    );
  };

  const ruleRow = (r: RuleRecord, isNew: boolean) => (
    <div key={r.id} id={`rule-${r.id}`} className={`rule-row${isNew ? " rule-row-new" : ""} stack stack-2`} aria-label={r.status === "locked" ? "Locked rule" : "Active rule"}>
      {isNew ? (
        <div>
          <Tag strong>{S.rules.justSaved}</Tag>
        </div>
      ) : null}
      <p className="rule-row-text">{r.text}</p>
      <div className="row row-between row-tight">
        <div className="row">
          <span className="caption">{S.rules.added(day(r.approvedAt ?? r.createdAt))}</span>
          {r.status === "locked" ? <Tag>{S.rules.locked}</Tag> : null}
        </div>
        <div className="row row-tight pull-right">
          <a className="btn btn-quiet" href={`#edit-${r.id}`}>
            {S.rules.editShort}
          </a>
          <form action={deleteRule}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="btn-quiet">
              {S.rules.del}
            </button>
          </form>
        </div>
      </div>
      <p className="caption">Visible to: {readers(r.scope).join(", ") || "no agent right now"}</p>
      <Details rule={r} scope={scopeLabel(r.scope)} />
      <details id={`edit-${r.id}`}>
        <summary>{EDIT_THEN_APPROVE}</summary>
        <EditForm rule={r} />
      </details>
      <details>
        <summary>{S.agents.details}</summary>
        <div className="row">
          {r.status === "active" ? (
            <form action={lockRule}>
              <input type="hidden" name="id" value={r.id} />
              <button type="submit" className="btn-sm">
                Lock
              </button>
            </form>
          ) : null}
          <form action={retireRule}>
            <input type="hidden" name="id" value={r.id} />
            <button type="submit" className="btn-sm">
              Stop using this rule
            </button>
          </form>
        </div>
        <p className="caption">{AGENT_MEMORY_NOTE}</p>
      </details>
    </div>
  );

  const main = (
    <div className="stack stack-5">
      {justSaved ? (
        <div className="stack stack-3">
          <Banner
            tone="done"
            action={
              <a className="btn btn-quiet pull-left" href="/rules">
                {S.rules.dismiss}
              </a>
            }
          >
            {q.message ?? S.rules.savedBanner}
          </Banner>
          <section className="card card-ink card-roomy" aria-label={S.rules.justSaved}>
            <div>
              <Sticker>{S.rules.justSaved}</Sticker>
            </div>
            <p className="rule-text">{justSaved.text}</p>
            <WhoRow label={S.rules.readBy} names={readers(justSaved.scope)} />
            <a className="link" href={`#rule-${justSaved.id}`}>
              {S.rules.findIt} {"↓"}
            </a>
          </section>
        </div>
      ) : q.message ? (
        <Notice>{q.message}</Notice>
      ) : null}

      {q.draft && !draft ? <Notice>{DRAFT_GONE}</Notice> : null}
      {draft ? proposal(draft, draftWords, true) : null}

      {older.length > 0 ? (
        <section aria-label={OLD_PROPOSALS_HEADING} className="stack">
          <p className="eyebrow">{OLD_PROPOSALS_HEADING}</p>
          <p className="caption">{OLD_PROPOSALS_NOTE}</p>
          {older.map((r, i) => proposal(r, olderWords[i], false))}
        </section>
      ) : null}

      <div className="stack stack-3">
        <h2>{S.rules.liveHeading(listed.length)}</h2>
        {listed.length === 0 ? (
          <p className="caption">None yet. No agent sees a rule until you save one.</p>
        ) : (
          <div className="rules-list">{listed.map((r) => ruleRow(r, r.id === justSaved?.id))}</div>
        )}
      </div>

      {retired.length > 0 ? (
        <details>
          <summary>Earlier versions and turned-down rules ({retired.length})</summary>
          {retired.map((r) => (
            <article key={r.id} className="card" aria-label="Retired rule">
              <p className="caption">Version {r.version} · not shown to any agent</p>
              <p className="rule-row-text">{r.text}</p>
              <Details rule={r} scope={scopeLabel(r.scope)} />
              <form action={deleteRule}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="btn-sm">
                  Delete this rule
                </button>
                <span className="caption"> {AGENT_MEMORY_NOTE}</span>
              </form>
            </article>
          ))}
        </details>
      ) : null}
    </div>
  );

  const who = <WhoCanSee title={S.rules.whoTitle} agents={readers("all")} note={S.rules.whoNote} />;

  return (
    <>
      <Nav current="rules" />
      <main className="page">
        <div className="stack stack-2">
          <h1>{S.rules.title}</h1>
          <p className="caption">{S.rules.short}</p>
        </div>
        <div className="cols">
          {main}
          {who}
        </div>
        <SignedInAs email={person.email} />
      </main>
    </>
  );
}
