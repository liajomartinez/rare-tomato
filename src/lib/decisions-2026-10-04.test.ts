import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AccountForm } from "@/app/start/account/AccountForm";
import { agreeAndSignIn } from "@/app/start/actions";
import { AGENT_INSTRUCTION, GROK_MESSAGE, MCP_URL, MUSE_MESSAGE, S } from "./strings";

// The framework's parts are stubbed (the sign-in library cannot load outside the server): the cookie that was set and where the person was sent are recorded.
const cookieSet = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies: async () => ({ set: cookieSet, get: () => undefined, delete: () => undefined }) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/lib/session", () => ({ requireReady: async () => ({ id: "x" }) }));

// The owner's decisions of 2026-10-04 (the design update). Each test keeps one decision from drifting: the exact instruction text, the connector
// address, the sign-up box, the words that must not appear, and Grok Bot's spelling.

const root = process.cwd();
const walk = (dir: string): string[] =>
  (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "node_modules" || e.name === ".next" || e.name === ".git" ? [] : walk(p);
    return [p];
  });
const rel = (f: string) => path.relative(root, f).split(path.sep).join("/");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");
const isTest = (f: string) => /\.test\.(ts|tsx)$/.test(f) || /\.script\.ts$/.test(f);
const srcFiles = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx|css)$/.test(f) && !isTest(f));
/** The words a person reads: every line of product code that is not a comment. */
const copyLines = (files: string[]) =>
  files.flatMap((f) =>
    fs
      .readFileSync(f, "utf8")
      .split(/\r?\n/)
      .map((text, i) => ({ file: rel(f), n: i + 1, text }))
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l.text)),
  );

describe("decision 2: the instruction text, word for word, in one constant", () => {
  const EXACT = "At the start of any task you do for me, including drafts, plans and lists, check my Rare Tomato rules (get_rules) and saved details (get_care_profile) first, then record what you did with log_task.";

  it("is exactly the owner's sentence", () => {
    expect(AGENT_INSTRUCTION).toBe(EXACT);
  });

  it("is written out in strings.ts and nowhere else in the product's code", () => {
    const holders = srcFiles.filter((f) => fs.readFileSync(f, "utf8").includes("check my Rare Tomato rules (get_rules)")).map(rel);
    expect(holders).toEqual(["src/lib/strings.ts"]);
    const copies = fs.readFileSync(path.join(root, "src/lib/strings.ts"), "utf8").split("check my Rare Tomato rules (get_rules)").length - 1;
    expect(copies).toBe(1);
  });

  it("the Claude and ChatGPT screens, Finish setup and the Muse message all use the constant", () => {
    expect(read("src/lib/onboarding-copy.ts")).toContain("AGENT_INSTRUCTION");
    expect(read("src/app/start/setup/page.tsx")).toContain("OpenCopyScreen"); // the instruction screens read COPY.<agent>.instr.text, which is the constant
    expect(read("src/app/agents/finish/page.tsx")).toContain("/start/setup"); // Finish setup opens the same flow
    expect(S.onb.setup.muse.msg).toBe(MUSE_MESSAGE);
  });

  it("the Muse message is the connect line, a full stop and a space, then the instruction", () => {
    expect(MUSE_MESSAGE).toBe(`Connect this MCP server for me: https://raretomato.ai/mcp. ${EXACT}`);
    expect(MUSE_MESSAGE.startsWith("Connect this MCP server for me: https://raretomato.ai/mcp. ")).toBe(true);
  });

  it("Grok Bot gets the one-line connect message only, with no instruction", () => {
    expect(GROK_MESSAGE).toBe("Connect this MCP server for me: https://raretomato.ai/mcp");
    expect(GROK_MESSAGE).not.toContain("get_rules");
    expect(S.onb.setup.grok.msg).toBe(GROK_MESSAGE);
  });
});

describe("decision 12: the connector address is https://raretomato.ai/mcp everywhere", () => {
  it("is the one constant, and the live address code is untouched", () => {
    expect(MCP_URL).toBe("https://raretomato.ai/mcp");
    const base = read("src/lib/base-address.ts");
    expect(base).toContain('DEFAULT_BASE_URL = "https://raretomato.ai"');
    expect(base).toContain('LEGACY_BASE_URL = "https://agent-care.vercel.app"');
  });

  it("no screen types another connector address", () => {
    const other = copyLines(srcFiles.filter((f) => /\.tsx$/.test(f) || /strings\.ts$/.test(f))).filter((l) => /https?:\/\/[^"' ]*\/mcp\b/.test(l.text) && !/raretomato\.ai\/mcp/.test(l.text));
    expect(other).toEqual([]);
  });
});

describe("decision 7: the name is always Grok Bot", () => {
  it("GrokBot appears nowhere in the repository (code, docs, scripts, evals, the design handoff)", () => {
    const skip = (f: string) => /(^|\/)(docs\/private|package-lock\.json)/.test(rel(f)) || /\.(png|woff2|jpg|ico)$/.test(f) || /decisions-2026-10-04\.test\.ts$/.test(f);
    const hits = walk(root)
      .filter((f) => !skip(f) && !/^(\.vercel|\.claude)\//.test(rel(f)))
      .filter((f) => /grok\s?bot/i.test(fs.readFileSync(f, "utf8")) && /grokbot/i.test(fs.readFileSync(f, "utf8")))
      .map(rel);
    expect(hits).toEqual([]);
  });

  it("the picker, the setup and the agent labels say 'Grok Bot'", () => {
    expect(S.onb.pick.options).toContain("Grok Bot");
    expect(read("src/lib/platforms.ts")).toContain('grok: "Grok Bot"');
    expect(read("src/lib/onboarding-flow.ts")).toContain('name: "Grok Bot"');
  });
});

describe("decision 1: there is no locked state in the product", () => {
  it("no screen, string or served field says locked, lock or unlock", () => {
    const hits = copyLines(srcFiles).filter((l) => /\b(locked|unlock\w*|lock|locks|locking)\b/i.test(l.text) && !/"locked"/.test(l.text));
    expect(hits.map((l) => `${l.file}:${l.n}: ${l.text.trim().slice(0, 100)}`)).toEqual([]);
  });

  it("the only place the old value is still named in product code is the safety net that reads it as active, and the unchanged enum", () => {
    const named = copyLines(srcFiles)
      .filter((l) => /"locked"/.test(l.text))
      .map((l) => l.file)
      .sort();
    expect(named).toEqual(["src/db/schema.ts", "src/lib/rules.ts"]);
  });

  it("the rule service has no lock and the served rule has no locked field", () => {
    const rules = read("src/lib/rules.ts");
    expect(rules).not.toMatch(/async lock\(|lock\?:|rule_locked/);
    expect(read("src/lib/mcp.ts")).not.toMatch(/locked/);
    expect(read("src/lib/services.ts")).not.toMatch(/locked/);
  });
});

describe("decision 9: nothing in the product talks about 'hello'", () => {
  it("no screen or string says hello (the server's harmless status tool keeps its name)", () => {
    const hits = copyLines(srcFiles.filter((f) => !/src\/lib\/(mcp|handler|services)\.ts$/.test(rel(f)))).filter((l) => /hello/i.test(l.text));
    expect(hits.map((l) => `${l.file}:${l.n}: ${l.text.trim().slice(0, 100)}`)).toEqual([]);
  });

  it("the old lines are gone from the handoff strings and from the guides", () => {
    const all = JSON.stringify(S);
    for (const gone of ["can only say hello", "Hello again", "Use the Rare Tomato hello tool"]) expect(all).not.toContain(gone);
    for (const f of walk(path.join(root, "docs/guides"))) expect(fs.readFileSync(f, "utf8"), rel(f)).not.toMatch(/hello/i);
    expect(read("README.md")).not.toMatch(/say hello/i);
  });

  it("an unconfirmed agent's screen says Needs confirmation", () => {
    expect(S.agents.needsConfirm).toBe("Needs confirmation");
    expect(read("src/app/agents/page.tsx")).toContain("S.agents.needsConfirm");
  });

  it("the server rule stays: an unconfirmed agent may call only the harmless status tool", () => {
    const mcp = read("src/lib/mcp.ts");
    expect(mcp).toContain('name: "hello"');
    expect(mcp).toContain("refused:");
  });
});

describe("decision 10: Muse is Experimental, with the reliability notice and a Reconnect button", () => {
  const NOTICE = "Our connection to Muse is experimental. It may need reconnecting after an hour or two. If that happens, reconnect the same way.";

  it("the notice is the handoff's wording and says an hour or two", () => {
    expect(S.onb.setup.muse.notice).toBe(NOTICE);
    expect(S.agents.museNote).toBe("Our connection to Muse is experimental. It may need reconnecting after an hour or two.");
    expect(NOTICE).toContain("may need reconnecting after an hour or two");
  });

  it("is on the setup message, the ready screen, Finish setup and the connected card, each with Experimental and a Reconnect", () => {
    const setup = read("src/app/start/setup/page.tsx");
    expect(setup).toContain("MUSE_NOTICE");
    expect(setup).toContain("COPY.muse.message?.tag");
    expect(read("src/lib/onboarding-copy.ts")).toContain("Experimental");
    expect(S.onb.pick.experimental).toBe("Experimental");
    // Round 12: the list shows only the name and a small status; the note and Reconnect are on the agent's own page.
    const agents = read("src/app/agents/page.tsx");
    expect(agents).toContain("S.agents.experimental");
    const agentPage = read("src/app/agents/view/page.tsx");
    expect(agentPage).toContain("S.agents.museNote");
    expect(agentPage).toContain("S.agents.reconnect");
    expect(agentPage).toContain("S.agents.experimental");
  });
});

describe("decision 6: one sign-up box, and the button is off until it is ticked", () => {
  const html = renderToStaticMarkup(createElement(AccountForm));

  it("has exactly one checkbox with the owner's sentence, and Terms and Privacy Notice are links", () => {
    expect(html.match(/type="checkbox"/g)).toHaveLength(1);
    expect(html).not.toMatch(/checked=""/);
    expect(html.replace(/<[^>]+>/g, "")).toContain("I am 18 or older and agree to the Terms and Privacy Notice.");
    expect(html).toMatch(/<a [^>]*href="\/terms"[^>]*>Terms<\/a>/);
    expect(html).toMatch(/<a [^>]*href="\/privacy"[^>]*>Privacy Notice<\/a>/);
  });

  it("the primary button is disabled until the box is ticked (it starts disabled)", () => {
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Continue<\/button>|<button[^>]*disabled=""[^>]*type="submit"[^>]*>Continue<\/button>/);
    expect(read("src/app/start/account/AccountForm.tsx")).toContain("disabled={!agreed}");
    // the old, separate "I am 18 or older." line is gone
    expect(html).not.toContain("Rare Tomato is for adults");
  });

  it("the tick is checked again on the server and recorded with a time right after sign-in", () => {
    const actions = read("src/app/start/actions.ts");
    expect(actions).toContain('formData.get("accept") !== "on"');
    expect(actions).toContain("TERMS_COOKIE");
    const session = read("src/lib/session.ts");
    expect(session).toContain("acceptTermsFor(person.id)");
    expect(session).toContain("TERMS_VERSION");
    // existing people are not asked again: the step shows only while the current version has not been accepted
    expect(session).toContain("needsTermsStep(person)");
    expect(read("src/lib/strings.ts")).toContain('TERMS_VERSION = "2026-10-03-2"');
  });
});

describe("the sign-up action, run for real with the framework's parts stubbed", () => {
  it("refuses without the box, and with it sets the cookie and goes to sign-in", async () => {
    const none = new FormData();
    await expect(agreeAndSignIn(none)).rejects.toThrow("REDIRECT /start/account");
    expect(cookieSet).not.toHaveBeenCalled();
    const ticked = new FormData();
    ticked.set("accept", "on");
    await expect(agreeAndSignIn(ticked)).rejects.toThrow("REDIRECT /sign-in");
    expect(cookieSet).toHaveBeenCalledTimes(1);
    expect(cookieSet.mock.calls[0][0]).toBe("rt_terms");
    expect(cookieSet.mock.calls[0][1]).toBe("2026-10-03-2");
  });
});
