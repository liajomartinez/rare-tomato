import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPERIMENTAL_LABEL, FEED_SUBLINE, MUSE_EXPERIMENTAL_LINE, THUMBS_DOWN_LABEL, THUMBS_UP_LABEL } from "./strings";

const read = (p: string) => fs.readFileSync(p, "utf8");

describe("design tokens", () => {
  const css = read("src/app/tokens.css").toLowerCase();
  it("holds the agreed colors in one file", () => {
    for (const c of ["#2d45d6", "#17172b", "#f6f1e7", "#4a4a63", "#fff"]) expect(css).toContain(c);
    expect(css).toContain("4px 4px 0");
  });
  it("has no blur, gradients or transitions", () => {
    const all = (css + read("src/app/globals.css").toLowerCase()).replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "");
    expect(all).not.toMatch(/gradient|blur\(|transition/);
  });
});

describe("UX copy", () => {
  it("uses the agreed words", () => {
    expect(THUMBS_UP_LABEL).toBe("Thumbs up");
    expect(THUMBS_DOWN_LABEL).toBe("Thumbs down");
    expect(FEED_SUBLINE).toBe("Agent-reported. Rate what went wrong and we will draft a rule.");
    expect(EXPERIMENTAL_LABEL).toBe("Experimental");
    expect(MUSE_EXPERIMENTAL_LINE).not.toMatch(/every chat/i);
  });
  it("Muse is never a required starter-line step", () => {
    expect(read("src/app/agents/page.tsx")).toContain('a.type !== "muse"');
  });
});

describe("docs/ux", () => {
  it("has a file for each designed screen and CLAUDE.md names the sync rule", () => {
    for (const f of ["feed", "rules", "agents", "tokens-only"]) expect(fs.existsSync(`docs/ux/${f}.md`)).toBe(true);
    expect(read("CLAUDE.md")).toContain("update its docs/ux/ file in the same commit");
  });
});
