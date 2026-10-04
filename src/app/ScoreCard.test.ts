import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TOMATO_STAGES } from "@/lib/scoring/config";
import { ScoreCard, type ScoreCardProps } from "./ScoreCard";

// FR-F6 and FR-F7: wherever the Adherence score or the tomato is shown, so are the "agent-reported" label and the coverage note, and the
// number and a word sit beside the tomato. NFR-3: color is never the only signal.

const base: ScoreCardProps = { percent: 72, scored: 9, tasksLogged: 12, freshnessPercent: 60, paused: false, needsAnswer: 0 };
const html = (over: Partial<ScoreCardProps> = {}) => renderToStaticMarkup(createElement(ScoreCard, { ...base, ...over }));

describe("the score card", () => {
  it("shows the percentage, a word label, the agent-reported label and the coverage note together", () => {
    const h = html();
    expect(h).toContain("72%");
    expect(h).toMatch(new RegExp(TOMATO_STAGES.map((s) => s.label).join("|")));
    expect(h).toContain("agent-reported");
    expect(h).toContain("12 tasks logged");
    expect(h).toContain("not visible here");
  });

  it("every possible score carries the label and the coverage note (a copy test over 0 to 100)", () => {
    for (let p = 0; p <= 100; p += 5) {
      const h = html({ percent: p });
      expect(h, `${p}%`).toContain("agent-reported");
      expect(h, `${p}%`).toContain("not visible here");
      expect(h, `${p}%`).toContain(`${p}%`);
    }
  });

  it("the tomato itself is hidden from screen readers and is never the only signal", () => {
    const h = html();
    expect(h).toContain('aria-hidden="true"');
    expect(h).toMatch(/72% &mdash; \w+|72% — \w+/);
  });

  it("with too few checks it says still learning and shows no number or tomato, but still shows the label and coverage", () => {
    const h = html({ percent: null, scored: 2 });
    expect(h).toContain("Still learning");
    expect(h).not.toContain("<svg");
    expect(h).not.toMatch(/\d+%\s*(&mdash;|—)/);
    expect(h).toContain("agent-reported");
    expect(h).toContain("not visible here");
  });

  it("says scoring is paused when model calls are off, and that feedback is still saved", () => {
    const h = html({ paused: true });
    expect(h).toContain("Scoring is paused");
    expect(h).toContain("feedback is still saved");
  });

  it("offers the answer link only when something needs the person", () => {
    expect(html()).not.toContain("need your answer");
    expect(html({ needsAnswer: 1 })).toContain("1 check needs your answer");
    expect(html({ needsAnswer: 3 })).toContain("3 checks need your answer");
  });

  it("freshness is its own meter, with text, and says nothing when there are no details", () => {
    expect(html()).toContain("60%");
    expect(html({ freshnessPercent: null })).toContain("add a few details");
  });

  it("never claims the score is verified or independent", () => {
    expect(html()).not.toMatch(/verified|independent|guarantee|enforced/i);
  });
});
