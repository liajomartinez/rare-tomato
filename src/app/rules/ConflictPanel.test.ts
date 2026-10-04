import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RuleRecord } from "@/lib/rules";
import { ConflictPanel, hasContradiction, overlapsFor, VERDICT_TEXT } from "./ConflictPanel";

const rule = (over: Partial<RuleRecord>): RuleRecord =>
  ({
    id: "r", text: "text", category: "messaging", scope: "all", status: "active", version: 1, supersedesId: null, sourceFeedbackId: null,
    when: "a buyer asks", do: null, dont: null, strength: "prefer", because: "b", approvedAt: null, createdAt: new Date(), conflictCheck: null, conflictsWith: [], ...over,
  }) as RuleRecord;
const noop = () => undefined;
const scopeLabel = (s: string) => (s === "all" ? "all your agents" : "one agent");

describe("overlaps shown on a proposal", () => {
  const existing = rule({ id: "old", text: "Always say the price is firm", status: "locked" });
  const proposal = rule({
    id: "new", status: "proposed", text: "Offer a small discount if asked",
    conflictCheck: { checkedAt: "x", promptVersion: "v", results: [{ ruleId: "old", verdict: "contradicts" }, { ruleId: "gone", verdict: "duplicate" }, { ruleId: "same", verdict: "independent" }] },
  });

  it("lists only rules that are still live and not independent", () => {
    const o = overlapsFor(proposal, [existing, proposal, rule({ id: "same" }), rule({ id: "gone", status: "retired" })]);
    expect(o.map((x) => x.target.id)).toEqual(["old"]);
    expect(hasContradiction(o)).toBe(true);
  });

  it("shows both rules side by side, says what was found in plain words, and offers replace, keep both and merge", () => {
    const html = renderToStaticMarkup(createElement(ConflictPanel, { rule: proposal, overlaps: overlapsFor(proposal, [existing]), resolve: noop, scopeLabel }));
    expect(html).toContain("Always say the price is firm");
    expect(html).toContain("Offer a small discount if asked");
    expect(html).toContain("Your rule now (locked)");
    expect(html).toContain("contradicts one of your rules");
    expect(html).toContain("Replace my rule with the proposed one");
    expect(html).toContain("Keep both");
    expect(html).toContain("Merge into one rule");
    expect(html).toContain("stays locked");
  });

  it("when the check could not be done, says so and offers no automatic choices", () => {
    const p = rule({ id: "n", status: "proposed", conflictCheck: { checkedAt: "x", promptVersion: "v", results: [{ ruleId: "old", verdict: "unchecked" }] } });
    const html = renderToStaticMarkup(createElement(ConflictPanel, { rule: p, overlaps: overlapsFor(p, [existing]), resolve: noop, scopeLabel }));
    expect(html).toContain("could not check");
    expect(html).not.toContain("Replace my rule");
  });

  it("renders nothing when there is no overlap", () => {
    expect(renderToStaticMarkup(createElement(ConflictPanel, { rule: proposal, overlaps: [], resolve: noop, scopeLabel }))).toBe("");
  });

  it("shows rule text as inert text, even if it contains markup", () => {
    const hostile = rule({ id: "old", text: "<script>alert(1)</script><img src=x onerror=alert(1)>", status: "active" });
    const html = renderToStaticMarkup(createElement(ConflictPanel, { rule: proposal, overlaps: [{ target: hostile, verdict: "duplicate" }], resolve: noop, scopeLabel }));
    // (React adds its own small script for form buttons, so check the hostile strings rather than any script tag.)
    expect(html).not.toContain("<script>alert(1)");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("never says or implies that rules are enforced", () => {
    for (const text of Object.values(VERDICT_TEXT)) {
      expect(text).not.toMatch(/\b(enforce\w*|guarantee\w*|force\w*|comply|compliance|violat\w*|monitor\w*)\b/i);
    }
  });
});
