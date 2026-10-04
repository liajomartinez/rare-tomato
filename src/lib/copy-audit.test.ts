import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AGENT_REPORTED, AGENT_MEMORY_NOTE, BLOCKED_CHECK_NOTE, coverageNote, FEED_NOTE, MUSE_LIMIT, RULES_ADVISORY, RULES_SHORT_NOTE } from "./strings";

// The copy audit (spec FR-F6, FR-H3, FR-H5, 6.7, 9.3 and CLAUDE.md copy rules). It reads every screen and the shared strings file and fails when
// the wording promises something the product cannot deliver: enforced rules, verified or independent scores, a guarantee about the
// blocked-data check, or the banned pet and livestock words. Negative statements ("not a guarantee", "never verified") are allowed.

const root = process.cwd();
const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(tsx|ts)$/.test(e.name) && !/\.test\./.test(e.name) && !/\.d\.ts$/.test(e.name) ? [p] : [];
  });
const files = [...walk(path.join(root, "src/app")), path.join(root, "src/lib/strings.ts"), path.join(root, "src/lib/agent-guides.ts")].filter((f) => fs.existsSync(f));

/** Lines with words in quotes or JSX text, which is where user-facing copy lives. Comments are skipped. */
function copyLines(file: string): { line: number; text: string }[] {
  return fs
    .readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((text, i) => ({ line: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text));
}
const bad = (re: RegExp, allowed?: RegExp) =>
  files.flatMap((f) =>
    copyLines(f)
      .filter(({ text }) => re.test(text) && !(allowed && allowed.test(text)))
      .map(({ line, text }) => `${path.relative(root, f)}:${line}: ${text.trim().slice(0, 140)}`),
  );

describe("copy audit: nothing promises more than the product does", () => {
  it("found the screens to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("never uses pet, tamagotchi, livestock or wrangling words", () => {
    expect(bad(/\b(tamagotchi|livestock|wrangl\w*|pets?)\b/i)).toEqual([]);
  });

  it("never calls the old code name in user-facing text", () => {
    expect(bad(/Agent Care/)).toEqual([]);
  });

  it("only says 'guarantee' to deny it", () => {
    expect(bad(/guarantee/i, /\b(not|no|never|cannot|can't|without)\b[^.]{0,40}guarantee|guarantee[^.]{0,20}\b(not|no)\b/i)).toEqual([]);
  });

  it("never says rules are enforced or followed as a fact", () => {
    expect(bad(/\benforc\w*/i, /\b(not|never|nothing|no one|cannot)\b[^.]{0,60}enforc/i)).toEqual([]);
  });

  it("only says 'verified' or 'independent' to deny it", () => {
    expect(
      bad(/\b(verified|independent\w*)\b/i, /verdict|independent (AI )?(companies|providers?|company)|\b(not|never|no|nothing|cannot|isn't|without)\b[^.]{0,60}\b(verified|independent\w*)\b|\b(verified|independent\w*)\b[^.]{0,30}\b(not|never)\b/i),
    ).toEqual([]);
  });

  it("never describes a score or a task without saying whose word it is", () => {
    expect(AGENT_REPORTED).toBe("agent-reported");
    expect(FEED_NOTE).toContain("agent-reported");
    expect(RULES_SHORT_NOTE).toContain("agent-reported");
    expect(coverageNote(3)).toContain("not visible");
  });

  it("describes the blocked-data check as best-effort every time it is described", () => {
    expect(BLOCKED_CHECK_NOTE).toMatch(/best-effort/);
    expect(BLOCKED_CHECK_NOTE).toMatch(/not a guarantee/);
  });

  it("says rules are advice that nothing forces an agent to follow", () => {
    expect(RULES_ADVISORY).toMatch(/nothing forces/);
    expect(RULES_ADVISORY).not.toMatch(/must follow|will follow|always follow/i);
  });

  it("every delete confirmation says an agent's own copy is not deleted (FR-H3)", () => {
    expect(AGENT_MEMORY_NOTE).toMatch(/own memory/);
    for (const f of ["src/app/feed/page.tsx", "src/app/rules/page.tsx", "src/app/profile/page.tsx"]) {
      expect(fs.readFileSync(path.join(root, f), "utf8"), f).toContain("AGENT_MEMORY_NOTE");
    }
    expect(fs.readFileSync(path.join(root, "src/app/data/page.tsx"), "utf8")).toMatch(/own memory/);
  });

  it("the Muse limit is stated as what we saw, not as a cause", () => {
    expect(MUSE_LIMIT).toMatch(/in our tests/);
    expect(MUSE_LIMIT).toMatch(/do not yet know why/);
  });
});
