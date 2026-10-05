import type { RuleRecord } from "@/lib/rules";
import { button, card, field, muted } from "../ui";

// Shown on a proposed rule that overlaps one the person already has (spec 6.3, FR-E3): both rules side by side, what the
// check found in plain words, and the choices. The check only informs. Nothing here is decided for the person, and
// wording never implies that agents are forced to follow any rule.

export interface Overlap {
  target: RuleRecord;
  verdict: "duplicate" | "contradicts" | "refines" | "unchecked";
}

/** The overlaps that matter right now: only rules that are still live, and never "independent". */
export function overlapsFor(rule: RuleRecord, all: RuleRecord[]): Overlap[] {
  const byId = new Map(all.map((r) => [r.id, r]));
  const out: Overlap[] = [];
  for (const res of rule.conflictCheck?.results ?? []) {
    const target = byId.get(res.ruleId);
    if (!target || target.status !== "active") continue;
    if (res.verdict === "independent") continue;
    out.push({ target, verdict: res.verdict });
  }
  return out;
}

export const hasContradiction = (overlaps: Overlap[]) => overlaps.some((o) => o.verdict === "contradicts");

export const VERDICT_TEXT: Record<Overlap["verdict"], string> = {
  duplicate: "This looks like the same rule you already have. Usually you will want to keep the one you have.",
  contradicts: "This contradicts one of your rules. Choose what to do: a contradiction can't be approved as it is.",
  refines: "This adds detail to one of your rules. You can keep both, or merge them into one.",
  unchecked: "We could not check this rule against this one. Please compare them yourself.",
};

type Action = (formData: FormData) => void | Promise<void>;

export function ConflictPanel({ rule, overlaps, resolve, scopeLabel }: { rule: RuleRecord; overlaps: Overlap[]; resolve: Action; scopeLabel: (scope: string) => string }) {
  if (overlaps.length === 0) return null;
  return (
    <section aria-label="Overlaps with your existing rules">
      <h3>This overlaps a rule you already have</h3>
      {overlaps.map(({ target, verdict }) => (
        <div key={target.id} style={card}>
          <p role={verdict === "contradicts" ? "alert" : "status"}>
            <strong>{VERDICT_TEXT[verdict]}</strong>
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <div>
              <h4>Your rule now</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{target.text}</p>
              <p style={muted}>
                Applies to: {scopeLabel(target.scope)}. When: {target.when}
              </p>
            </div>
            <div>
              <h4>The proposed rule</h4>
              <p style={{ whiteSpace: "pre-wrap" }}>{rule.text}</p>
              <p style={muted}>
                Applies to: {scopeLabel(rule.scope)}. When: {rule.when}
              </p>
            </div>
          </div>
          {verdict !== "unchecked" ? (
            <div>
              <ChoiceForm kind="replace" label="Replace my rule with the proposed one" rule={rule} target={target} resolve={resolve} />{" "}
              <ChoiceForm kind="keep_both" label="Keep both" rule={rule} target={target} resolve={resolve} />
              <details>
                <summary>Merge into one rule</summary>
                <form action={resolve}>
                  <input type="hidden" name="id" value={rule.id} />
                  <input type="hidden" name="targetId" value={target.id} />
                  <input type="hidden" name="kind" value="merge" />
                  <label>
                    The merged rule, in plain words
                    <textarea name="text" defaultValue={rule.text} required maxLength={300} rows={3} style={field} />
                  </label>
                  <label>
                    When it applies
                    <input name="when" defaultValue={rule.when} required maxLength={200} style={field} />
                  </label>
                  <button type="submit" style={button}>
                    Save the merged rule and approve it
                  </button>
                </form>
              </details>
            </div>
          ) : null}
        </div>
      ))}
    </section>
  );
}

function ChoiceForm({ kind, label, rule, target, resolve }: { kind: "replace" | "keep_both"; label: string; rule: RuleRecord; target: RuleRecord; resolve: Action }) {
  return (
    <form action={resolve} style={{ display: "inline" }}>
      <input type="hidden" name="id" value={rule.id} />
      <input type="hidden" name="targetId" value={target.id} />
      <input type="hidden" name="kind" value={kind} />
      <button type="submit" style={button}>
        {label}
      </button>
    </form>
  );
}
