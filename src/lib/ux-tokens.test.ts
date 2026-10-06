import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The design handoff (kept outside this repo) is the source of truth for the look. These tests keep the code from drifting away from it:
// the token files must be the handoff's files, and no component may write its own color, font, radius, border or shadow.

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const HANDOFF_TOKEN_FILES = ["base", "colors", "fonts", "source-aliases", "spacing", "typography"];

const HAS_HANDOFF = fs.existsSync(path.join(root, "design-source/tokens"));

describe("design tokens", () => {
  // The handoff is a private design note kept outside the public repo; this comparison is skipped when it is not present.
  it.skipIf(!HAS_HANDOFF)("the six token files are the handoff's own files, unchanged", () => {
    for (const f of HANDOFF_TOKEN_FILES) expect(read(`src/app/tokens/${f}.css`), f).toBe(read(`design-source/tokens/${f}.css`));
  });

  it("the agreed values are there", () => {
    const colors = read("src/app/tokens/colors.css");
    for (const v of ["--rt-blue:#2D45D6", "--rt-ink:#231A2E", "--rt-paper:#F6F3F5", "--rt-ink-2:#5B5068", "--rt-line:#CFC7DB", "--rt-mist:#ECE8F4", "--rt-pink:#F58DB8"]) expect(colors).toContain(v);
    expect(read("src/app/tokens/typography.css")).toContain("--font-body:'Figtree'");
    expect(read("src/app/tokens/typography.css")).toContain("--font-display:'Dela Gothic One'");
    expect(read("src/app/tokens/spacing.css")).toContain("--shadow-button:3px 3px 0 var(--rt-ink)");
  });

  it("the old palette and fonts are gone", () => {
    const all = ["src/app/globals.css", "src/app/layout.tsx", "src/app/tokens/app-literals.css"].map(read).join("\n").toLowerCase();
    for (const gone of ["#f6f1e7", "#17172b", "bricolage", "ibm plex", "#faf3e0", "#c1121f"]) expect(all, gone).not.toContain(gone);
  });

  it("the five font files are our own and the page loads no font service", () => {
    for (const f of ["DelaGothicOne-Regular", "Figtree-Regular", "Figtree-Medium", "Figtree-SemiBold", "Figtree-Bold"]) expect(fs.existsSync(path.join(root, `src/app/fonts/${f}.woff2`))).toBe(true);
    expect(read("src/app/layout.tsx")).not.toMatch(/next\/font|fonts\.googleapis/);
  });

  it("every non-token value the screens use directly has a name in app-literals.css", () => {
    // Revision 8 of the handoff no longer ships literals-used-in-screens.json (it was a list of the mockups' raw values); the names stay, so the
    // screens keep using them and nothing writes a raw border or radius.
    const css = read("src/app/tokens/app-literals.css");
    for (const border of ["2px solid var(--rt-ink)", "1.5px solid var(--rt-line)", "1.5px solid var(--rt-ink)", "2px dashed var(--rt-ink)"]) expect(css, border).toContain(border);
    for (const r of ["3px", "18px", "28px 28px 0 0"]) expect(css, r).toContain(r);
    expect(css).toContain("--rt-scrim");
  });
});

/** Every file whose job is to hold raw values. Nothing else may write them. */
const TOKEN_FILES = [/^src\/app\/tokens\//, /^src\/app\/brand-colors\.ts$/];

const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : [rel];
  });

const components = [...walk("src/app"), "src/lib/scoring/config.ts"].filter(
  (f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f) && !TOKEN_FILES.some((re) => re.test(f)),
);

/** Text with comments removed, so a sentence in a comment cannot trip the scan. */
const code = (f: string) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

describe("no raw colors, fonts, radii, borders or shadows outside the token files", () => {
  it("scans real files", () => {
    expect(components.length).toBeGreaterThan(30);
  });

  it("colors", () => {
    for (const f of components) {
      const c = code(f);
      expect(c.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [], `${f}: hex color`).toEqual([]);
      expect(c.match(/\b(rgba?|hsla?)\(/g) ?? [], `${f}: rgb/hsl color`).toEqual([]);
    }
  });

  it("font names", () => {
    for (const f of components) {
      expect(code(f).match(/font-?family|Figtree|Dela Gothic|system-ui|sans-serif|monospace|Arial|Helvetica/g) ?? [], `${f}: font name`).toEqual([]);
    }
  });

  it("radii", () => {
    for (const f of components) {
      const c = code(f);
      expect(c.match(/border-radius\s*:\s*[^v;}\s][^;}]*/g) ?? [], `${f}: border-radius`).toEqual([]);
      expect(c.match(/borderRadius\s*:\s*(\d|"\d|'\d)/g) ?? [], `${f}: borderRadius`).toEqual([]);
    }
  });

  it("borders and shadows", () => {
    for (const f of components) {
      const c = code(f);
      expect(c.match(/\bborder(-(top|bottom|left|right))?\s*:\s*[^;}\n]*\b\d+(\.\d+)?px/g) ?? [], `${f}: border`).toEqual([]);
      expect(c.match(/\bborder(Top|Bottom|Left|Right)?\s*:\s*["'`]\d/g) ?? [], `${f}: border`).toEqual([]);
      expect(c.match(/box-shadow\s*:\s*(?!var\(|none)/g) ?? [], `${f}: box-shadow`).toEqual([]);
      expect(c.match(/boxShadow\s*:\s*["'`](?!var\(|none)/g) ?? [], `${f}: boxShadow`).toEqual([]);
    }
  });

  it("buttons, cards and chips follow the handoff's sizes through tokens", () => {
    const css = read("src/app/globals.css");
    expect(css).toContain("min-height:var(--button-h)");
    expect(css).toContain("min-height:var(--chip-h)");
    expect(css).toContain("border-radius:var(--radius-card)");
    expect(css).toContain("box-shadow:var(--shadow-button)");
    expect(css).toContain("box-shadow:var(--shadow-sheet)");
  });
});

describe.skipIf(!fs.existsSync(path.join(root, "docs/ux")))("docs/ux", () => {
  it("has the screen specs, and CLAUDE.md names the handoff rule", () => {
    for (const f of ["README", "feed", "rules", "agents", "home", "onboarding", "tokens-only"]) expect(fs.existsSync(path.join(root, `docs/ux/${f}.md`)), f).toBe(true);
    expect(read("CLAUDE.md")).toContain("design-source/");
    expect(read("CLAUDE.md")).toContain("update its docs/ux/ file in the same commit");
  });
});
