import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { COPY, EXPIRED } from "./onboarding-copy";
import { S } from "./strings";

// Round 9 renames: "What your agents did" is Agent Activity, "Your agents" is Connected Agents, the menu item is Your Rules, and the page that holds rules and
// saved details is Your Rules and Info. "Old Claude" and "Disconnected" are never shown. This fails if one of the old phrases comes back in any user-facing string.

const BANNED = ["Your details", "What your agents did", "Old Claude", "Disconnected"];
const BANNED_PATTERNS = [/\bOld (Claude|ChatGPT|Grok Bot|Grok|Muse|Marge|Pip)\b/, /^Your agents$/m, /\bYour agents\b(?! can| may| will| check)/];

const root = process.cwd();
const walk = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? (e.name === "node_modules" || e.name === ".next" ? [] : walk(rel)) : [rel];
  });

/** Source text with comments removed, so a note to a maintainer cannot trip the scan; only strings and markup remain. */
const code = (f: string) => fs.readFileSync(path.join(root, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const sources = walk("src").filter((f) => /\.(tsx?|css)$/.test(f) && !/\.test\./.test(f));
const docs = ["README.md", ...walk("docs/ux"), ...walk("docs/guides")].filter((f) => f.endsWith(".md"));

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") out.push(node);
  else if (typeof node === "function") {
    for (const args of [[3, 7, 5], ["Name", "When"]]) {
      try {
        const v = (node as (...a: unknown[]) => unknown)(...args);
        if (typeof v === "string") out.push(v);
      } catch {
        /* a function that wants other arguments is skipped */
      }
    }
  } else if (Array.isArray(node)) node.forEach((x) => strings(x, out));
  else if (node && typeof node === "object") Object.values(node).forEach((x) => strings(x, out));
  return out;
}

describe("the old names are gone from everything a person reads", () => {
  it("scans real files", () => {
    expect(sources.length).toBeGreaterThan(40);
    expect(docs.length).toBeGreaterThan(5);
  });

  it("no user-facing string in the strings files says Your details, What your agents did, Old Claude or Disconnected", () => {
    const all = [...strings(S), ...strings(COPY)].join("\n");
    for (const b of BANNED) expect(all, b).not.toContain(b);
    for (const p of BANNED_PATTERNS) expect(all).not.toMatch(p);
  });

  it("no screen, component or style file has them either", () => {
    for (const f of sources) {
      const c = code(f);
      for (const b of BANNED) expect(c, `${f}: ${b}`).not.toContain(b);
      for (const p of BANNED_PATTERNS) expect(c, `${f}: ${p}`).not.toMatch(p);
    }
  });

  it("the written docs for screens and guides do not use them", () => {
    for (const f of docs) {
      const c = fs.readFileSync(path.join(root, f), "utf8");
      for (const b of BANNED) expect(c, `${f}: ${b}`).not.toContain(b);
    }
  });

  it("the new names are in place", () => {
    expect(S.feed.title).toBe("Agent Activity");
    expect(S.nav.feed).toBe("Agent Activity");
    expect(S.agents.title).toBe("Connected Agents");
    expect(S.nav.agents).toBe("Connected Agents");
    expect(S.nav.rules).toBe("Your Rules");
    expect(S.rules.title).toBe("Your Rules and Info");
    expect(S.rules.subtext).toBe("This is the information your agents check before they work for you.");
    expect(S.agents.attention).toBe("Needs attention");
    expect(S.agents.expired).toBe(EXPIRED);
    expect(COPY.claude.done.body).toContain("under Agent Activity");
  });

  it("an expired agent is shown by its own name, so no string has an Old prefix", () => {
    expect(strings(S).concat(strings(COPY)).filter((s) => /\bOld [A-Z]/.test(s))).toEqual([]);
  });
});
