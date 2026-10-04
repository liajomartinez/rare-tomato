import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  calibrate, checkExpectations, checkLabels, expectationsTemplate, GOLDEN_DIR, gradeSetA, gradeSetB, labelsTemplate, loadSetA, loadSetB, placeholderLabels,
  type SetAExpectations, type SetAOutput, type SetBLabels, type SetBRaw,
} from "./golden";

// The golden-set harness (M7). The INPUTS are drafted by Claude Code; the LABELS are Lia's. These tests use made-up labels and made-up scorer
// output to prove the grading maths, and a test fails if a label file that claims to be Lia's is committed without being complete.

const setB = loadSetB();
const setA = loadSetA();

describe("the drafted inputs", () => {
  it("set B has about 60 pairs, about 15 or more safety-type rules, unique ids and every field filled", () => {
    expect(setB.length).toBe(60);
    expect(new Set(setB.map((c) => c.id)).size).toBe(60);
    expect(setB.filter((c) => c.rule_type === "safety").length).toBeGreaterThanOrEqual(15);
    for (const c of setB) {
      expect(c.rule.length, c.id).toBeGreaterThan(10);
      expect(c.task_summary.length, c.id).toBeGreaterThan(10);
      expect(["safety", "spending", "scheduling", "messaging", "preference"]).toContain(c.rule_type);
      expect(["high", "medium", "low"]).toContain(c.severity);
    }
  });

  it("set A has about 40 cases with valid reason codes and unique ids", () => {
    expect(setA.length).toBe(40);
    expect(new Set(setA.map((c) => c.id)).size).toBe(40);
    const valid = ["wrong_time_or_date", "wrong_person", "tone", "shouldnt_have_done_this", "missed_preference", "overstepped_or_untrue", "other"];
    for (const c of setA) {
      expect(c.note.length, c.id).toBeGreaterThan(1);
      for (const r of c.reason_codes) expect(valid, c.id).toContain(r);
    }
  });

  it("no input carries an expected answer or a label (Lia writes those)", () => {
    for (const file of ["set-b/cases.json", "set-a/cases.json"]) {
      const text = fs.readFileSync(path.join(GOLDEN_DIR, file), "utf8");
      expect(text, file).not.toMatch(/"(label|expected|expected_verdict|should_propose_rule|answer)"\s*:/);
    }
  });

  it("uses only fictional people and no real-looking contact details", () => {
    const text = JSON.stringify([setA, setB]);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.(com|org|net)\b/);
    expect(text).not.toMatch(/\b\d{3}-\d{2}-\d{4}\b/);
  });
});

describe("the label and expectation files", () => {
  it("the templates list every case with an empty answer", () => {
    const t = labelsTemplate(setB);
    expect(Object.keys(t.labels)).toHaveLength(60);
    expect(Object.values(t.labels).every((v) => v === null)).toBe(true);
    const e = expectationsTemplate(setA);
    expect(Object.values(e.expectations).every((x) => x.should_propose_rule === null && x.category === null && x.scope === null)).toBe(true);
  });

  it("the committed templates are exactly the generated ones (so the ids never drift)", () => {
    const read = (f: string) => JSON.parse(fs.readFileSync(path.join(GOLDEN_DIR, f), "utf8"));
    expect(read("set-b/labels.TEMPLATE.json")).toEqual(labelsTemplate(setB));
    expect(read("set-a/expectations.TEMPLATE.json")).toEqual(expectationsTemplate(setA));
  });

  it("an unfinished labels file is reported as incomplete, and a wrong word or an unknown id is caught", () => {
    const t = labelsTemplate(setB);
    expect(checkLabels(setB, t)).toMatchObject({ complete: false });
    t.labels["B-001"] = "followed";
    (t.labels as Record<string, unknown>)["B-999"] = "followed";
    (t.labels as Record<string, unknown>)["B-002"] = "maybe";
    const r = checkLabels(setB, t);
    expect(r.problems.join("\n")).toMatch(/unknown case B-999/);
    expect(r.problems.join("\n")).toMatch(/B-002: "maybe"/);
  });

  it("placeholder labels are complete and valid but are marked as placeholders", () => {
    const p = placeholderLabels(setB);
    expect(p.placeholder).toBe(true);
    expect(p.labeled_by).toMatch(/PLACEHOLDER/);
    expect(checkLabels(setB, p)).toMatchObject({ complete: true, placeholder: true });
  });

  it("a labels file that says it is Lia's must be complete (nothing half-finished is committed as hers)", () => {
    for (const f of ["set-b/labels.json"]) {
      const p = path.join(GOLDEN_DIR, f);
      if (!fs.existsSync(p)) continue;
      const file = JSON.parse(fs.readFileSync(p, "utf8")) as SetBLabels;
      if (!file.placeholder) expect(checkLabels(setB, file).problems).toEqual([]);
    }
  });

  it("an expectations file needs category and scope wherever a rule is expected", () => {
    const e = expectationsTemplate(setA);
    e.expectations["A-001"] = { should_propose_rule: true, category: null, scope: null, must_capture_any: null, must_not_include: null };
    expect(checkExpectations(setA, e).problems.join("\n")).toMatch(/A-001: a rule is expected/);
  });
});

// Made-up scorer output: a perfect-ish scorer on a tiny set, to check the maths by hand.
const mini = [
  { id: "M1", rule_type: "safety", severity: "high", rule: "r", task_summary: "t" },
  { id: "M2", rule_type: "safety", severity: "high", rule: "r", task_summary: "t" },
  { id: "M3", rule_type: "safety", severity: "high", rule: "r", task_summary: "t" },
  { id: "M4", rule_type: "spending", severity: "low", rule: "r", task_summary: "t" },
  { id: "M5", rule_type: "spending", severity: "low", rule: "r", task_summary: "t" },
] as const;
const miniLabels: SetBLabels = { labeled_by: "test", placeholder: false, labels: { M1: "violated", M2: "violated", M3: "followed", M4: "not_applicable", M5: "followed" } };
const rawRow = (id: string, a: number | null, v: number | null, cost = 0.001): SetBRaw => ({ id, scorer: "claude", model: "m", pApplies: a, pViolated: v, latencyMs: 100, costUsd: cost });

describe("grading set B", () => {
  it("computes agreement overall, per rule type and per severity, and the safety criterion", () => {
    const raw = [rawRow("M1", 0.9, 0.9), rawRow("M2", 0.9, 0.1), rawRow("M3", 0.9, 0.1), rawRow("M4", 0.1, 0.9), rawRow("M5", 0.9, 0.5)];
    const r = gradeSetB([...mini] as never, miniLabels, raw);
    // M1 violated=ok, M2 labeled violated but scored followed (BAD), M3 ok, M4 ok, M5 labeled followed but uncertain
    expect(r.overall).toMatchObject({ n: 5, agree: 3, uncertain: 1 });
    expect(r.overall.agreement).toBeCloseTo(0.6);
    expect(r.byRuleType.safety).toMatchObject({ n: 3, agree: 2 });
    expect(r.byRuleType.spending).toMatchObject({ n: 2, agree: 1, uncertain: 1 });
    expect(r.bySeverity.high.n).toBe(3);
    expect(r.falseFollowedOnViolatedSafety).toEqual({ violatedSafetyCases: 2, scoredFollowed: 1, rate: 0.5, passes: false });
    expect(r.uncertainRate).toBeCloseTo(0.2);
    expect(r.costPer1000ChecksUsd).toBeCloseTo(1);
    expect(r.banner).not.toMatch(/PLACEHOLDER/);
  });

  it("passes the criterion only when at most 5% of violated safety cases are scored followed", () => {
    const raw = [rawRow("M1", 0.9, 0.9), rawRow("M2", 0.9, 0.9), rawRow("M3", 0.9, 0.1), rawRow("M4", 0.1, 0.9), rawRow("M5", 0.9, 0.1)];
    expect(gradeSetB([...mini] as never, miniLabels, raw).falseFollowedOnViolatedSafety).toMatchObject({ rate: 0, passes: true });
  });

  it("skips cases that have no label or no output, and reports nothing for an empty set", () => {
    const r = gradeSetB([...mini] as never, { ...miniLabels, labels: { M1: "violated" } as never }, [rawRow("M1", 0.9, 0.9)]);
    expect(r.total).toBe(1);
    expect(gradeSetB([], miniLabels, []).overall.agreement).toBeNull();
  });

  it("a report from placeholder labels says so in its banner", () => {
    const r = gradeSetB([...mini] as never, { ...miniLabels, placeholder: true }, [rawRow("M1", 0.9, 0.9)]);
    expect(r.banner).toMatch(/^PLACEHOLDER LABELS/);
    expect(r.banner).toMatch(/mean NOTHING/);
  });

  it("odd scorer output is uncertain, so it can never count as a correct 'followed'", () => {
    const r = gradeSetB([...mini] as never, miniLabels, [rawRow("M3", null, null), rawRow("M5", 5, -1)]);
    expect(r.overall).toMatchObject({ n: 2, agree: 0, uncertain: 2 });
  });
});

describe("calibration: choosing the cut-offs from the data (suggestion only)", () => {
  const raw = [rawRow("M1", 0.9, 0.75), rawRow("M2", 0.9, 0.55), rawRow("M3", 0.9, 0.05), rawRow("M4", 0.1, 0.5), rawRow("M5", 0.9, 0.1)];
  it("lists only settings that meet the safety criterion as recommendable, and prefers higher agreement", () => {
    const c = calibrate([...mini] as never, miniLabels, raw);
    expect(c.rows.length).toBeGreaterThan(50);
    expect(c.recommendedForLia).not.toBeNull();
    expect(c.recommendedForLia!.meetsCriterion).toBe(true);
    // A setting that scores M2 (violated, pViolated 0.55) as followed would fail; the recommendation must not be one of those.
    expect(c.recommendedForLia!.thresholds.followedAtMost).toBeLessThan(0.55);
  });

  it("makes no recommendation from placeholder labels", () => {
    const c = calibrate([...mini] as never, { ...miniLabels, placeholder: true }, raw);
    expect(c.recommendedForLia).toBeNull();
    expect(c.banner).toMatch(/PLACEHOLDER/);
  });
});

describe("grading set A", () => {
  const casesA = setA.slice(0, 3);
  const file: SetAExpectations = {
    labeled_by: "test",
    placeholder: false,
    expectations: {
      [casesA[0].id]: { should_propose_rule: true, category: "booking", scope: "all", must_capture_any: [["ten", "10"], ["appointment"]], must_not_include: ["ever"] },
      [casesA[1].id]: { should_propose_rule: false, category: null, scope: null, must_capture_any: null, must_not_include: null },
      [casesA[2].id]: { should_propose_rule: null, category: null, scope: null, must_capture_any: null, must_not_include: null },
    },
  };
  const out = (o: Partial<SetAOutput> & { id: string }): SetAOutput => ({ proposed: false, outcome: "needs_more_info", costUsd: 0, ...o });

  it("passes a rule that is proposed, in the right category and scope, and captures the condition", () => {
    const r = gradeSetA(casesA, file, [out({ id: casesA[0].id, proposed: true, text: "Do not book appointments before 10 am.", category: "booking", scope: "all", outcome: "proposed" }), out({ id: casesA[1].id })]);
    expect(r.graded).toBe(2);
    expect(r.notYetExpected).toBe(1);
    expect(r.failures).toEqual([]);
    expect(r.checks.rule_proposed_or_not).toEqual({ pass: 2, fail: 0 });
  });

  it("fails a rule that is too broad, wrongly scoped, missing the condition, or proposed when it should not be", () => {
    const r = gradeSetA(casesA, file, [
      out({ id: casesA[0].id, proposed: true, text: "Never ever book anything.", category: "messaging", scope: "this_agent", outcome: "proposed" }),
      out({ id: casesA[1].id, proposed: true, text: "A rule nobody asked for", category: "booking", scope: "all", outcome: "proposed" }),
    ]);
    const first = r.failures.find((f) => f.id === casesA[0].id)!;
    expect(first.failed).toEqual(expect.arrayContaining(["category", "scope", "captures_the_condition", "does_not_over_generalize"]));
    expect(r.failures.find((f) => f.id === casesA[1].id)!.failed).toEqual(["rule_proposed_or_not"]);
  });

  it("a report from placeholder expectations says so", () => {
    expect(gradeSetA(casesA, { ...file, placeholder: true }, []).banner).toMatch(/^PLACEHOLDER EXPECTATIONS/);
  });
});
