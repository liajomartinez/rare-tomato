import Link from "next/link";
import { agentsFor, feedbackFor, profileFor, rulesFor, tasksFor } from "@/db/production";
import { whoCanSeeRule } from "@/lib/agents-view";
import { STRENGTHS, type RuleRecord } from "@/lib/rules";
import { requireReady } from "@/lib/session";
import { BottomLink, Nav, Notice, PageSheet, Tag } from "../ui";
import { ConflictPanel, hasContradiction, overlapsFor } from "./ConflictPanel";
import { AGENT_MEMORY_NOTE, DRAFT_GONE, EDIT_THEN_APPROVE, OLD_PROPOSALS_HEADING, S } from "@/lib/strings";
import { approveRule, deleteRule, discardDraft, editRule, resolveRule } from "./actions";

export const dynamic = "force-dynamic";

const STRENGTH_LABEL: Record<string, string> = { prefer: "Prefer", always: "Always", never: "Never" };
const day = (d: Date) => d.toISOString().slice(0, 10);

function EditForm({ rule }: { rule: RuleRecord }) {
  return (
    <form action={editRule} className="stack stack-3">
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

type Words = { taskId: string; note?: string; source?: "person" | "agent_reported"; agent: string | null } | null;

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

export default async function Rules({ searchParams }: { searchParams: Promise<{ message?: string; saved?: string; draft?: string; sheet?: string }> }) {
  const person = await requireReady();
  const q = await searchParams;
  await rulesFor(person.id).purgeExpiredDrafts().catch(() => 0); // drafts nobody decided on are deleted, not kept waiting
  const [rules, agents, facts] = await Promise.all([rulesFor(person.id).list(), agentsFor(person.id).list(), profileFor(person.id).list()]);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const scopeLabel = (s: string) => (s === "all" ? "all your agents" : `only ${agentName.get(s.replace("agent:", "")) ?? "one agent"}`);

  // The person's own words behind each proposal, for their eyes only, and where a saved rule came from.
  const fb = feedbackFor(person.id);
  const wordsFor = async (r: RuleRecord): Promise<Words> => {
    if (!r.sourceFeedbackId) return null;
    const f = await fb.getWithNote(r.sourceFeedbackId);
    if (!f) return null;
    const task = await tasksFor(person.id).get(f.taskId);
    return { taskId: f.taskId, note: f.note, source: f.source, agent: task ? agentName.get(task.connectionId) ?? null : null };
  };

  const newest = (a: RuleRecord, b: RuleRecord) => b.createdAt.getTime() - a.createdAt.getTime();
  const proposed = rules.filter((r) => r.status === "proposed").sort(newest);
  const live = rules.filter((r) => r.status === "active").sort(newest);
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

  // The proposed rule (not saved yet), as designed: eyebrow and a "Not saved yet" tag, the rule, where it came from, who can use it, then Save rule and Discard.
  // An older proposal (an agent's reported correction, or one drafted before drafts were shown right away) uses the same card and keeps its editing.
  const proposal = (r: RuleRecord, words: Words, designed: boolean) => {
    const overlaps = overlapsFor(r, rules);
    const blocked = hasContradiction(overlaps);
    return (
      <section key={r.id} id={`proposal-${r.id}`} className={designed ? "card card-ink card-roomy" : "flat-row stack"} aria-label={S.rules.eyebrow}>
        <div className="row row-between row-tight">
          <p className="eyebrow">{S.rules.eyebrow}</p>
          <Tag>{S.rules.notSaved}</Tag>
        </div>
        <p className="rule-text">{r.text}</p>
        <div className="stack stack-3">
          {words ? (
            <>
              {words.source === "agent_reported" ? (
                <span className="caption">
                  Your agent reported that you said this{words.note ? <>: “{words.note}”</> : null}. This came from the agent, not from you, so please check it matches what you meant.
                </span>
              ) : (
                <span className="caption">{S.rules.source(words.agent ?? "an agent")}</span>
              )}
              <a className="link" href={`/feed#task-${words.taskId}`}>
                {S.rules.seeSource}
              </a>
            </>
          ) : null}
          {designed ? null : r.because ? <p className="caption">{r.because}</p> : null}
          {designed ? null : <Details rule={r} scope={scopeLabel(r.scope)} />}
        </div>
        <ConflictPanel rule={r} overlaps={overlaps} resolve={resolveRule} scopeLabel={scopeLabel} />
        <WhoRow label={S.rules.scope} names={readers(r.scope)} />
        <div className="stack">
          {blocked ? (
            <p className="caption">To save this rule, choose replace, keep both, or merge above.</p>
          ) : (
            <div className="actions">
              <form action={approveRule}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="btn-primary btn-block">
                  {S.rules.save}
                </button>
              </form>
              <form action={discardDraft}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="btn-block">
                  {S.rules.discard}
                </button>
              </form>
            </div>
          )}
          {designed || blocked ? null : (
            <details>
              <summary className="as-button">{EDIT_THEN_APPROVE}</summary>
              <EditForm rule={r} />
            </details>
          )}
        </div>
      </section>
    );
  };

  const ruleRow = (r: RuleRecord, isNew: boolean) => (
    <div key={r.id} id={`rule-${r.id}`} className="flat-row stack stack-1" aria-label="Rule">
      {isNew ? <b className="caption">{S.rules.justSaved}</b> : null}
      <p className="rule-row-text">{r.text}</p>
      <div className="row row-between row-tight">
        <span className="caption">{S.rules.added(day(r.approvedAt ?? r.createdAt))}</span>
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
      <details id={`edit-${r.id}`}>
        <summary>{EDIT_THEN_APPROVE}</summary>
        <Details rule={r} scope={scopeLabel(r.scope)} />
        <EditForm rule={r} />
      </details>
    </div>
  );

  const twoSections = true; // rules and info: a page with two sections shows both headings
  const closeHref = "/rules";

  return (
    <>
      <Nav current="rules" />
      <main className="page-flat">
        <h1>{S.rules.title}</h1>
        <p className="caption">{S.rules.subtext}</p>
        {justSaved ? <p className="plain-line" role="status">{q.message ?? S.rules.savedBanner}</p> : q.message ? <Notice>{q.message}</Notice> : null}
        {q.draft && !draft ? <Notice>{DRAFT_GONE}</Notice> : null}
        {draft ? (
          proposal(draft, draftWords, true)
        ) : (
          <Link href="/rules/new" prefetch={false} className="btn btn-primary btn-block">
            Write a rule
          </Link>
        )}

        {older.length > 0 ? (
          <section aria-label={OLD_PROPOSALS_HEADING} className="flat">
            <p className="eyebrow">{OLD_PROPOSALS_HEADING}</p>
            {older.map((r, i) => proposal(r, olderWords[i], false))}
          </section>
        ) : null}

        <section className="flat" aria-label="Rules">
          {twoSections ? <h2>{S.rules.liveHeading(listed.length)}</h2> : null}
          {listed.length === 0 ? <p className="plain-line">None yet. No agent sees a rule until you save one.</p> : listed.map((r) => ruleRow(r, r.id === justSaved?.id))}
        </section>

        <section className="flat" aria-label="Info">
          {twoSections ? <h2>{S.rules.partInfo}</h2> : null}
          {facts.length === 0 ? (
            <p className="plain-line">Nothing saved yet. Agents can read the details you add here.</p>
          ) : (
            facts.map((f) => (
              <div key={f.id} className="flat-row row row-between row-nowrap">
                <div className="stack stack-0 grow">
                  <b>{f.key}</b>
                  <span>{f.value}</span>
                  {f.sensitive ? <span className="caption">Sensitive</span> : null}
                </div>
                <Link href={`/profile#fact-${f.id}`} prefetch={false} className="btn btn-quiet pull-right">
                  {S.rules.editShort}
                </Link>
              </div>
            ))
          )}
          <p style={{ margin: 0 }}>
            <Link href="/profile" prefetch={false} className="link-sm">
              Add a detail
            </Link>
          </p>
        </section>

        {retired.length > 0 ? (
          <details>
            <summary>Earlier versions and turned-down rules ({retired.length})</summary>
            <div className="flat">
              {retired.map((r) => (
                <article key={r.id} className="flat-row stack stack-1" aria-label="Retired rule">
                  <p className="caption">Version {r.version} · not shown to any agent</p>
                  <p className="rule-row-text">{r.text}</p>
                  <Details rule={r} scope={scopeLabel(r.scope)} />
                  <form action={deleteRule}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn-quiet pull-left">
                      Delete this rule
                    </button>
                  </form>
                </article>
              ))}
            </div>
          </details>
        ) : null}

        <BottomLink href="/rules?sheet=about">About rules</BottomLink>
      </main>
      {q.sheet === "about" ? (
        <PageSheet title="About rules" closeHref={closeHref}>
          <p className="caption">{S.rules.short}</p>
          <p className="caption">{S.rules.delNote}</p>
          <p className="caption">{AGENT_MEMORY_NOTE}</p>
          <p className="label-sm">{S.rules.whoTitle}</p>
          <p className="caption">{readers("all").length ? readers("all").join(", ") : "No agents can see this."}</p>
          <p className="caption">{S.agents.whoNote}</p>
        </PageSheet>
      ) : null}
    </>
  );
}
