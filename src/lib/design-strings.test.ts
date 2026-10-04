import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { S, STARTER_LINE } from "./strings";

// The design handoff's strings (design-source/src/strings.js) and the S object in strings.ts must say the same thing, key by key.
// The differences below are on purpose and are listed in the build report. A new handoff that changes any other string fails this test,
// which is the cue to read the change and update strings.ts.

type Tree = { [k: string]: unknown };
const source = fs.readFileSync(path.join(process.cwd(), "design-source/src/strings.js"), "utf8");
const sandbox: { window: { S?: Tree } } = { window: {} };
vm.runInNewContext(source, sandbox);
const handoff = sandbox.window.S as Tree;

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

/** Keys that differ on purpose. Each has a reason. */
const DIFFERENT_ON_PURPOSE: Record<string, string> = {
  // Muse: owner decision 2026-10-03. Muse is experimental and nobody is told to instruct it in every chat.
  "muse.chatSentence": "removed (owner decision: no every-chat step for Muse)",
  "muse.step1": "removed (same)",
  "muse.next": "removed (same)",
  "muse.copy": "removed (same)",
  "muse.facts": "the sentences that tell people to use the chat each time are left out",
  "onb.setup.titleChat": "removed (same)",
  "onb.setup.titleChat~text": "removed (same)",
  "onb.setup.chatOnly": "replaced by onb.setup.experimental",
  "onb.setup.guides.Muse.kind": "experimental instead of chat",
  "onb.setup.guides.Muse.intro": "the owner's experimental line",
  "onb.setup.guides.Muse.steps.0": "removed (paste each time)",
  "onb.setup.guides.Muse.steps.1": "removed (paste each time)",
  // The hosted sign-in page asks for the email and decides the method (open item O9).
  "onb.signup.body": "reworded: we do not email a link",
  "onb.signup.send": "Continue instead of Email me a link",
  "onb.signup.email": "not used: no email field here",
  "onb.signup.emailPh": "not used: no email field here",
};
/** Keys that exist only in strings.ts. */
const ONLY_IN_CODE = new Set(["muse.line", "muse.experimental", "onb.setup.museTitle", "onb.setup.experimental"]);

describe("strings.ts follows the design handoff, key by key", () => {
  const a = flat(handoff);
  const b = flat(S as unknown as Tree);

  it("found the handoff's strings", () => {
    expect(Object.keys(a).length).toBeGreaterThan(300);
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

  it("the starter line is the handoff's, in both places", () => {
    expect(STARTER_LINE).toBe(handoff && (flat(handoff)["starter.line"] as string));
    expect(STARTER_LINE).toBe(S.onb.setup.line);
  });

  it("the Muse copy never tells anyone to instruct it in every chat, and has the owner's label and line", () => {
    const muse = Object.entries(b).filter(([k]) => k.startsWith("muse.") || k.startsWith("onb.setup.guides.Muse"));
    for (const [k, v] of muse) expect(v, k).not.toMatch(/each time|every chat|each chat|in the chat itself/i);
    expect(S.muse.experimental).toBe("Experimental");
    expect(S.muse.line).toBe("Muse connects, but it may not check your rules on its own, and its connection may stop after an hour or two.");
  });

  it("no emoji, and none of the words the product must not use", () => {
    for (const [k, v] of Object.entries(b)) {
      expect(v, k).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(v, k).not.toMatch(/\b(verified|enforced|must follow|guaranteed|tamagotchi|livestock|wrangl)/i);
    }
  });
});
