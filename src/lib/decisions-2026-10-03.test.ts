import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOMATO_STAGES } from "./scoring/config";
import { tomatoFor } from "./scoring/verdict";
import { UNASSIGNED_LIFETIME_DAYS, UNASSIGNED_LIFETIME_MS } from "./connections";
import { CARE_SHEET_NAME, SAVE_AS_RULE, SCORE_BAND_LABELS, STILL_LEARNING, unconfirmedAgentNote } from "./strings";

// Lia's decisions of 2026-10-03 (the project notes): O1 the verb, O2 the score-band words (Set C), O8 the real unconfirmed-agent limit,
// O6 the care sheet's name stays one constant. These tests keep each one from drifting.

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
const sources = walk(path.join(process.cwd(), "src"));
const text = (f: string) => fs.readFileSync(f, "utf8");

describe("O1: the verb is 'Save as a rule'", () => {
  it("is the label on the drafted-rule button on Your rules", () => {
    expect(SAVE_AS_RULE).toBe("Save as a rule");
    expect(text("src/app/rules/page.tsx")).toContain("{SAVE_AS_RULE}");
  });
});

describe("O2: score-band words, Set C", () => {
  it("are exactly Still learning, Needs attention, Fair, Okay, Good, Very good", () => {
    expect([...SCORE_BAND_LABELS]).toEqual(["Still learning", "Needs attention", "Fair", "Okay", "Good", "Very good"]);
  });

  it("stage 0 is 'Still learning'; the five scored stages carry the other five words in order", () => {
    expect(STILL_LEARNING.startsWith("Still learning")).toBe(true);
    expect(TOMATO_STAGES.map((s) => s.label)).toEqual(["Needs attention", "Fair", "Okay", "Good", "Very good"]);
  });

  it("every percentage maps to one of the five scored words", () => {
    for (let p = 0; p <= 100; p++) expect(SCORE_BAND_LABELS.slice(1)).toContain(tomatoFor(p).label);
    expect(tomatoFor(0).label).toBe("Needs attention");
    expect(tomatoFor(100).label).toBe("Very good");
  });

  it("the old placeholder stage words appear nowhere in the app's wording", () => {
    for (const f of sources) expect(text(f), f).not.toMatch(/label: "(Green|Turning|Orange|Red|Ripe)"/);
  });
});

describe("O8: the unconfirmed-agent limit is the one the product computes", () => {
  it("is built from the lifetime constant, with the real time when there is one", () => {
    expect(UNASSIGNED_LIFETIME_MS).toBe(UNASSIGNED_LIFETIME_DAYS * 24 * 3600 * 1000);
    expect(unconfirmedAgentNote(null, UNASSIGNED_LIFETIME_DAYS)).toBe(`An agent you do not confirm stops working after ${UNASSIGNED_LIFETIME_DAYS} days.`);
    expect(unconfirmedAgentNote("2026-10-10 12:00 UTC", 7)).toContain("2026-10-10 12:00 UTC");
    expect(unconfirmedAgentNote(null, 1)).toContain("1 day.");
  });

  it("no screen types a clock time or a day count for it by hand", () => {
    for (const f of sources) expect(text(f), f).not.toMatch(/\b\d{1,2}:\d{2}\s?(am|pm)\b/i);
    expect(text("src/app/agents/page.tsx")).toContain("unconfirmedAgentNote(");
  });
});

describe("O6: the care sheet's name is one constant (Lia is renaming it)", () => {
  it("no screen spells the name out, so a rename is a one-line change", () => {
    expect(CARE_SHEET_NAME).toBe("Care sheet");
    const offenders = sources
      .filter((f) => !f.endsWith(path.join("lib", "strings.ts")))
      .flatMap((f) =>
        text(f)
          .split(/\r?\n/)
          .map((line, i) => ({ f, line, n: i + 1 }))
          .filter(({ line }) => /care sheet/i.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line) && /["'`>]/.test(line) && !/\$\{CARE_SHEET_NAME|\{CARE_SHEET_NAME/.test(line)),
      )
      .map(({ f, n, line }) => `${path.relative(process.cwd(), f)}:${n}: ${line.trim().slice(0, 100)}`);
    // Text that explains how to use the sheet may still say "the sheet"; only the NAME must come from the constant. List what remains so a
    // rename does not miss it.
    expect(offenders).toEqual([]);
  });
});
