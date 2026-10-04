import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, thresholdsFromEnv, TOMATO_STAGES } from "./config";
import { adherenceScore, freshness, tomatoFor, verdictFor } from "./verdict";

// Formulas unit tested (FR-F3). Edges are tested one by one; the cut-offs are config (FR-F2), provisional until golden set B (M7).

describe("verdictFor: the SPEC 6.5 table", () => {
  it.each([
    [0.0, 0.0, "not_applicable"],
    [0.29, 0.99, "not_applicable"], // below 0.3 it does not apply, however high "violated" is
    [0.3, 0.7, "violated"], // both edges are inclusive
    [0.84, 0.97, "violated"],
    [0.3, 0.3, "followed"],
    [0.9, 0.05, "followed"],
    [0.9, 0.5, "uncertain"],
    [0.3, 0.31, "uncertain"],
    [0.9, 0.69, "uncertain"],
  ])("applies %f and violated %f -> %s", (a, v, expected) => {
    expect(verdictFor(a, v)).toBe(expected);
  });

  it("anything that is not a probability is uncertain, never followed", () => {
    for (const bad of [null, undefined, NaN, Infinity, -0.1, 1.1, "0.9", {}, []]) {
      expect(verdictFor(bad, 0.0)).toBe("uncertain");
      expect(verdictFor(0.9, bad)).toBe("uncertain");
    }
  });

  it("the cut-offs are config: a stricter setting changes the answer without touching code", () => {
    expect(verdictFor(0.9, 0.6)).toBe("uncertain");
    expect(verdictFor(0.9, 0.6, { ...DEFAULT_THRESHOLDS, violatedAtLeast: 0.5 })).toBe("violated");
  });

  it("reads thresholds from the environment, ignoring bad values", () => {
    expect(thresholdsFromEnv({ SCORING_THRESHOLDS: JSON.stringify({ violatedAtLeast: 0.6 }) }).violatedAtLeast).toBe(0.6);
    expect(thresholdsFromEnv({ SCORING_THRESHOLDS: JSON.stringify({ violatedAtLeast: 7 }) })).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFromEnv({ SCORING_THRESHOLDS: "not json" })).toEqual(DEFAULT_THRESHOLDS);
    expect(thresholdsFromEnv({})).toEqual(DEFAULT_THRESHOLDS);
  });
});

describe("adherenceScore: followed / (followed + violated) over 14 days", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const day = 24 * 3600 * 1000;
  const check = (verdict: "followed" | "violated" | "not_applicable" | "uncertain", daysAgo: number) => ({ verdict, at: new Date(now.getTime() - daysAgo * day) });

  it("is still learning (no number) with fewer than 5 scored verdicts", () => {
    const four = [check("followed", 1), check("followed", 1), check("followed", 2), check("violated", 2)];
    expect(adherenceScore(four, now).percent).toBeNull();
    expect(adherenceScore([...four, check("followed", 3)], now).percent).toBe(80);
  });

  it("ignores not_applicable and uncertain, and anything older than 14 days", () => {
    const checks = [
      check("followed", 1), check("followed", 2), check("followed", 3), check("followed", 4), check("violated", 5),
      check("not_applicable", 1), check("uncertain", 1), check("violated", 20), check("violated", 15),
    ];
    const s = adherenceScore(checks, now);
    expect(s).toMatchObject({ followed: 4, violated: 1, scored: 5, percent: 80 });
  });

  it("rounds, and reaches 0 and 100", () => {
    const allViolated = Array.from({ length: 5 }, () => check("violated", 1));
    expect(adherenceScore(allViolated, now).percent).toBe(0);
    const allFollowed = Array.from({ length: 6 }, () => check("followed", 1));
    expect(adherenceScore(allFollowed, now).percent).toBe(100);
    expect(adherenceScore([...Array.from({ length: 2 }, () => check("followed", 1)), ...Array.from({ length: 4 }, () => check("violated", 1))], now).percent).toBe(33);
  });
});

describe("the tomato indicator: fixed stages from config, always with a number and a word", () => {
  it("has four or five stages in rising order", () => {
    expect(TOMATO_STAGES.length).toBeGreaterThanOrEqual(4);
    expect(TOMATO_STAGES.length).toBeLessThanOrEqual(5);
    const from = TOMATO_STAGES.map((s) => s.from);
    expect([...from].sort((a, b) => a - b)).toEqual(from);
    expect(from[0]).toBe(0);
  });

  it("maps each percentage to exactly one stage, with a word label", () => {
    expect(tomatoFor(0).stageIndex).toBe(0);
    expect(tomatoFor(100).stageIndex).toBe(TOMATO_STAGES.length - 1);
    for (let p = 0; p <= 100; p++) {
      const t = tomatoFor(p);
      expect(t.label.length).toBeGreaterThan(0);
      expect(TOMATO_STAGES[t.stageIndex].from).toBeLessThanOrEqual(p);
    }
    expect(tomatoFor(49).label).not.toBe(tomatoFor(50).label);
  });
});

describe("freshness: the share of details reviewed in the last 90 days", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  it("is null with no details, and counts only recent reviews", () => {
    expect(freshness([], now)).toBeNull();
    const facts = [
      { lastReviewedAt: new Date("2026-10-01T00:00:00Z") },
      { lastReviewedAt: new Date("2026-05-01T00:00:00Z") },
      { lastReviewedAt: null },
      { lastReviewedAt: new Date("2026-09-01T00:00:00Z") },
    ];
    expect(freshness(facts, now)).toBe(50);
  });
});
