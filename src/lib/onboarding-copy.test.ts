import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { COPY, MUSE_NOTICE, PICK, R9, RAILS, ROADMAP } from "./onboarding-copy";
import { AGENT_INSTRUCTION, GROK_MESSAGE, MCP_URL, MUSE_MESSAGE } from "./strings";

// The words used in onboarding must be Lia's, word for word: the handoff's strings.v9.js, and the two copy files she supplied (2026-10-05).
// If one of those changes, this fails, which is the cue to read the change and update src/lib/onboarding-copy.ts.

const dir = path.join(process.cwd(), "design-source/round9/copy");
const read = (f: string) => fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");

type Tree = { [k: string]: unknown };
const sandbox: Tree = { S: { nav: {} }, MCP_URL, INSTRUCTION: AGENT_INSTRUCTION };
sandbox.window = sandbox;
vm.runInNewContext(read("strings.v9.js"), sandbox);
const V = sandbox.V6 as Tree & {
  claude: Tree; chatgpt: Tree; grok: Tree; muse: Tree; r9: Record<string, unknown>; roadmap: Tree; pick: Tree; rails: Record<string, [string, string | null][]>;
};

/** Every string in a tree, flattened to "a.b.0" -> text. */
function flat(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "function") return out;
  if (Array.isArray(node)) node.forEach((v, i) => flat(v, `${prefix}.${i}`, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  else if (typeof node === "string") out[prefix] = node;
  return out;
}

describe("onboarding copy is word for word the handoff's strings.v9.js", () => {
  it("the numbered lines of every open-first screen", () => {
    for (const k of ["c2", "c5", "g2", "g5", "grokMsg", "museMsg"] as const) expect(R9[k], k).toEqual(V.r9[k]);
    for (const n of ["Claude", "ChatGPT", "Grok Bot", "Muse"]) expect(R9.chat(n), n).toEqual((V.r9.chat as (n: string) => string[])(n));
    expect(R9.goBack("Claude")).toBe((V.r9.goBack as (n: string) => string)("Claude"));
  });

  it.each(["claude", "chatgpt", "grok", "muse"] as const)("%s: waiting, confirm, check, rule and done screens", (key) => {
    const mine = COPY[key] as unknown as Tree;
    const theirs = V[key] as Tree;
    for (const part of ["wait", "confirm", "rule", "done"]) expect(flat(mine[part]), `${key}.${part}`).toEqual(flat(theirs[part]));
    expect(mine.summary).toBe(theirs.summary);
    expect(mine.finish).toBe(theirs.finish);
    const m = flat(mine.check);
    const t = flat((theirs.check as Tree) ?? {});
    // The handoff's check.body (the old paragraph) and check.lines are replaced by the round 9 numbered lines; the rest must match.
    for (const k of Object.keys(t)) {
      if (k.startsWith("body") || k.startsWith("open")) continue;
      if (k.startsWith("lines")) continue;
      if (k.startsWith("waiting")) continue;
      expect(m[k] ?? m[k.replace(/^lines/, "rows")], `${key}.check.${k}`).toBe(t[k]);
    }
    expect((mine.check as { rows: string[] }).rows).toEqual((theirs.check as { lines: string[] }).lines);
    expect((mine.check as { waiting: string }).waiting).toBe((theirs.check as { waiting: string }).waiting);
  });

  it("the Claude and ChatGPT intro, form and instruction screens", () => {
    for (const key of ["claude", "chatgpt"] as const) {
      const mine = COPY[key];
      const theirs = V[key] as Tree & { c1: Tree; c2: Tree; instr: Tree };
      expect(flat(mine.intro), `${key}.intro`).toEqual(flat(theirs.c1));
      const f = mine.form!;
      const g = theirs.c2 as { title: string; items: unknown; steps?: string[]; small: string; options?: unknown; choose?: string; link?: string; help?: string; main: string };
      expect(f.title).toBe(g.title);
      expect(f.items).toEqual(g.items);
      expect(f.small).toBe(g.small);
      expect(f.main).toBe(key === "chatgpt" ? (V.chatgpt.c2 as { main: string }).main : g.main);
      if (g.steps) expect(f.steps).toEqual(g.steps);
      if (g.options) expect(f.options).toEqual(g.options);
      if (g.choose) expect(f.choose).toBe(g.choose);
      if (g.link) expect(f.link).toBe(g.link);
      if (g.help) expect(f.help).toBe(g.help);
      const i = theirs.instr as { title: string; body: string; text: string; copy: string; open: string; saved: string };
      expect(mine.instr).toMatchObject({ title: i.title, body: i.body, text: i.text, copy: i.copy, open: i.open, saved: i.saved });
    }
  });

  it("Grok Bot and Muse one-message screens and the Muse notice", () => {
    const k1 = V.grok.k1 as { title: string; msg: string; copy: string; main: string };
    expect(COPY.grok.message).toMatchObject({ title: k1.title, msg: k1.msg, copy: k1.copy, main: k1.main });
    const m1 = V.muse.m1 as { tag: string; title: string; msg: string; copy: string; main: string; notice: string };
    expect(COPY.muse.message).toMatchObject({ tag: m1.tag, title: m1.title, msg: m1.msg, copy: m1.copy, main: m1.main, notice: m1.notice });
    expect(MUSE_NOTICE).toBe(m1.notice);
    expect(COPY.grok.wait).toEqual(V.grok.wait);
    expect(COPY.muse.wait).toEqual(V.muse.wait);
  });

  it("roadmap, picker and rail labels", () => {
    expect(ROADMAP).toEqual(V.roadmap);
    const p = V.pick as { title: string; body: string; options: string[]; exp: string; museLine: string; button: string; need: string };
    expect(PICK).toEqual({ title: p.title, body: p.body, options: p.options, exp: p.exp, museLine: p.museLine, button: p.button, need: p.need });
    expect(RAILS).toEqual(V.rails.claude ? { claude: V.rails.claude, chatgpt: V.rails.chatgpt, grok: V.rails.grok, muse: V.rails.muse } : {});
  });

  it("the constants are the handoff's: connector address, standing instruction, and the two pasted messages", () => {
    expect((V.muse.m1 as { msg: string }).msg).toBe(MUSE_MESSAGE);
    expect((V.grok.k1 as { msg: string }).msg).toBe(GROK_MESSAGE);
    expect(MUSE_MESSAGE).toBe(`Connect this MCP server for me: https://raretomato.ai/mcp. ${AGENT_INSTRUCTION}`);
  });
});

describe("the two copy files Lia supplied", () => {
  const exact = read("rare-tomato-round9-exact-copy-2026-10-05.md");
  const base = read("rare-tomato-onboarding-copy-2026-10-05.md");
  // Every numbered line in the exact-copy file ("1. Tap Open ...") must be one of the lines in the code, word for word.
  const lines = [...exact.matchAll(/^[123]\. (.+)$/gm)].map((m) => m[1].trim());
  const inCode = new Set([...R9.c2, ...R9.c5, ...R9.g2, ...R9.g5, ...R9.grokMsg, ...R9.museMsg, ...R9.chat("Claude"), ...R9.chat("ChatGPT"), ...R9.chat("Grok Bot"), ...R9.chat("Muse")]);

  it("found the numbered lines", () => {
    expect(lines.length).toBeGreaterThanOrEqual(20);
  });

  it("every numbered line in the round 9 exact-copy file is in the code, word for word", () => {
    expect(lines.filter((l) => !inCode.has(l))).toEqual([]);
  });

  it("every other onboarding sentence in the base copy file is in the code", () => {
    const wanted = [
      ["Title", COPY.claude.confirm.title],
      ["Title", COPY.claude.check.ok.title],
      ["Title", COPY.claude.check.part.title],
      ["Title", COPY.claude.check.none.title],
      ["Title", COPY.claude.rule.title],
      ["Title", COPY.claude.done.title],
      ["Title", COPY.claude.wait.title],
      ["Body", COPY.claude.confirm.small.replace("Only you see", "Only you see")],
    ] as const;
    for (const [, text] of wanted) expect(base, text).toContain(text.replace(/'/g, "'"));
    // The instruction and the check messages
    expect(base).toContain(AGENT_INSTRUCTION);
    expect(base).toContain(COPY.claude.check.msg);
    expect(base).toContain(COPY.claude.check.part.msg);
    expect(base).toContain(GROK_MESSAGE);
    expect(base).toContain(ROADMAP.title);
    expect(base).toContain(PICK.title);
  });
});
