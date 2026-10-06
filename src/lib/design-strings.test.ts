import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { ACCEPT_LABEL, AGENT_INSTRUCTION, GROK_MESSAGE, MCP_URL, MUSE_MESSAGE, S, SIGN_UP_CONTINUE } from "./strings";

// The design handoff's strings (its copy file, UX-1 revision 8) and the S object in strings.ts must say the same thing, key by key.
// The differences below are on purpose and are listed in the build report. A new handoff that changes any other string fails this test, which is the
// cue to read the change and update strings.ts.

type Tree = { [k: string]: unknown };
// The handoff files are private design notes kept outside the public repo. When they are not present these comparison tests are skipped.
const SOURCE_FILE = path.join(process.cwd(), "design-source/copy/strings.js");
const HAS_HANDOFF = fs.existsSync(SOURCE_FILE);
const source = HAS_HANDOFF ? fs.readFileSync(SOURCE_FILE, "utf8") : "";
// The handoff file writes to window.* and reads its own globals (INSTRUCTION, MCP_URL), so the sandbox is its own window.
const sandbox: Tree & { window?: unknown } = {};
sandbox.window = sandbox;
vm.runInNewContext(source, sandbox);
const handoff = sandbox.S as Tree;

/** Flatten to "a.b.c" -> text. A function is called with sample arguments so its sentence can be compared too. */
function flat(node: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (typeof node === "function") {
    out[prefix] = (node as (...a: unknown[]) => unknown)(3, 7, 5) as string;
    out[`${prefix}~text`] = (node as (...a: unknown[]) => unknown)("Name", "When") as string;
  } else if (Array.isArray(node)) node.forEach((v, i) => flat(v, `${prefix}.${i}`, out));
  else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) flat(v, prefix ? `${prefix}.${k}` : k, out);
  else out[prefix] = String(node);
  return out;
}

/** Keys that differ on purpose. Each has a reason. (None today: the owner's decisions of 2026-10-04 are all constants outside S, and S matches the handoff.) */
const DIFFERENT_ON_PURPOSE: Record<string, string> = Object.fromEntries(
  ["nav.feed", "nav.rules", "nav.details", "nav.agents", "feed.title", "rules.title", "rules.liveHeading", "rules.liveHeading~text", "agents.title", "agents.disconnected", "agents.oldLabel", "onb.landing.points.1.0", "onb.landing.points.1.1", "onb.dash.connectedHeading", "agents.museNote", "onb.setup.muse.notice", "onb.setup.stopped.title", "onb.setup.stopped.body", "onb.setup.stopped.button"].map((k) => [k, "Round 9 renames (design-source/round9): Agent Activity, Connected Agents, Your Rules, Your Rules and Info; no Disconnected and no Old X."]),
);
/** Keys that exist only in strings.ts. */
const ONLY_IN_CODE = new Set<string>(["rules.subtext", "rules.partRules", "rules.partInfo", "agents.removed", "agents.expired", "home.ask", "home.ask~text"]);

describe.skipIf(!HAS_HANDOFF)("strings.ts follows the design handoff, key by key", () => {
  const a = flat(handoff);
  const b = flat(S as unknown as Tree);

  it("found the handoff's strings", () => {
    expect(Object.keys(a).length).toBeGreaterThan(250);
  });

  it("every handoff string is in strings.ts with the same words, except the listed differences", () => {
    const wrong = Object.keys(a).filter((k) => !(k in DIFFERENT_ON_PURPOSE) && b[k] !== a[k]);
    expect(wrong.map((k) => `${k}: ${JSON.stringify(a[k])} vs ${JSON.stringify(b[k])}`)).toEqual([]);
  });

  it("strings.ts adds nothing the handoff does not have, except the listed additions", () => {
    const extra = Object.keys(b).filter((k) => !(k in a) && ![...ONLY_IN_CODE].some((o) => k === o || k.startsWith(`${o}.`)));
    expect(extra).toEqual([]);
  });

  it("every listed difference is real (a stale entry means the handoff or the code moved)", () => {
    for (const k of Object.keys(DIFFERENT_ON_PURPOSE)) expect(a[k] !== b[k], k).toBe(true);
  });

  it("the instruction and the connector address are the handoff's, in both places", () => {
    expect(AGENT_INSTRUCTION).toBe(sandbox.INSTRUCTION);
    expect(MCP_URL).toBe(sandbox.MCP_URL);
    expect(S.onb.setup.grok.msg).toBe(GROK_MESSAGE);
    expect(S.onb.setup.muse.msg).toBe(MUSE_MESSAGE);
  });

  it("the sign-up checkbox sentence is the handoff's, joined", () => {
    expect(S.onb.signup.agree[0] + S.onb.signup.terms + S.onb.signup.agree[1] + S.onb.signup.privacy + S.onb.signup.agree[2]).toBe(ACCEPT_LABEL);
  });

  it("the one difference in kind: the sign-up button says Continue, because the hosted sign-in page decides how the person signs in", () => {
    expect(SIGN_UP_CONTINUE).toBe("Continue");
    expect(S.onb.signup.send).toBe("Email me a link"); // the handoff's own words stay in S, but no screen shows them
  });

  it("no emoji, and none of the words the product must not use", () => {
    for (const [k, v] of Object.entries(b)) {
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v, k).not.toMatch(/\b(verified|enforced|must follow|guaranteed|tamagotchi|livestock|wrangl)/i);
    }
  });
});
