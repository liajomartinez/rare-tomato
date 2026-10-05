import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TOMATO_STAGES } from "@/lib/scoring/config";
import { ScoreCard, type ScoreCardProps } from "./ScoreCard";

// FR-F6 and FR-F7: wherever the rule-following score or the tomato is shown, so are the "Agent-reported" label and the count it is based on, and the
// number and a word sit beside the tomato. NFR-3: color is never the only signal. Owner decision 4 (2026-10-04): the card is built as the design shows it.

const base: ScoreCardProps = { agentName: "Marge", percent: 72, reportedTasks: 14, paused: false, needsAnswer: 0 };
const html = (over: Partial<ScoreCardProps> = {}) => renderToStaticMarkup(createElement(ScoreCard, { ...base, ...over }));

describe("the score card", () => {
  it("is titled with the agent's name and shows the percentage, a word label, the agent-reported tag and the number of reported tasks", () => {
    const h = html();
    expect(h).toContain("Marge&#x27;s rule following");
    expect(h).toContain("72%");
    expect(h).toMatch(new RegExp(TOMATO_STAGES.map((s) => s.label).join("|")));
    expect(h).toContain("Agent-reported");
    expect(h).toContain("Based on 14 reported tasks.");
  });

  it("every possible score carries the tag and the count (a copy test over 0 to 100)", () => {
    for (let p = 0; p <= 100; p += 5) {
      const h = html({ percent: p });
      expect(h, `${p}%`).toContain("Agent-reported");
      expect(h, `${p}%`).toContain("Based on 14 reported tasks.");
      expect(h, `${p}%`).toContain(`${p}%`);
    }
  });

  it("the tomato itself is hidden from screen readers and is never the only signal", () => {
    const h = html();
    expect(h).toContain('aria-hidden="true"');
    expect(h).toMatch(new RegExp(TOMATO_STAGES.map((s) => s.label).join("|")));
  });

  it("says Still learning, with no number, until the agent has reported 5 tasks", () => {
    for (const reportedTasks of [0, 3, 4]) {
      const h = html({ reportedTasks });
      expect(h, String(reportedTasks)).toContain("Still learning");
      expect(h, String(reportedTasks)).toContain(`${reportedTasks} reported tasks so far. We need 5 before showing a score.`);
      expect(h, String(reportedTasks)).toContain("tomato-0-still-learning");
      expect(h, String(reportedTasks)).not.toContain("72%");
      expect(h, String(reportedTasks)).toContain("Agent-reported");
    }
    expect(html({ reportedTasks: 5 })).toContain("72%");
  });

  it("says Still learning when the tasks could not be checked yet, even with 5 or more reported", () => {
    const h = html({ percent: null, reportedTasks: 9 });
    expect(h).toContain("Still learning");
    expect(h).not.toContain("of the time");
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

  it("has a secondary button to review recent tasks and a 'How scoring works' note that says only reported tasks are scored", () => {
    const h = html();
    expect(h).toContain("Review recent tasks");
    expect(h).not.toContain("btn-primary");
    expect(h).toContain("How scoring works");
    expect(h).toContain("Rare Tomato can only score tasks the agent reports. Unreported activity is not visible.");
  });

  it("never claims the score is verified or independent", () => {
    expect(html()).not.toMatch(/verified|independent|guarantee|enforced/i);
  });
});
