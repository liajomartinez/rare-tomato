import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Privacy from "./page";
import Terms from "../terms/page";

// The plain-language Privacy Notice lists every provider, calls the blocked-data check best-effort, says agents may keep what they read, and
// promises nothing the product does not do. (The wider wording tests are in src/lib/terms-acceptance.test.ts and src/lib/run10-copy.test.ts.)

const privacy = renderToStaticMarkup(createElement(Privacy));
const terms = renderToStaticMarkup(createElement(Terms));

describe("the Privacy Notice", () => {
  it("lists every provider we use, and not one that receives nothing", () => {
    for (const name of ["Vercel", "Neon", "WorkOS", "Anthropic"]) expect(privacy).toContain(name);
    expect(privacy).not.toContain("TypeSafe");
  });

  it("describes the blocked-data check as best-effort and never as a guarantee", () => {
    expect(privacy).toMatch(/best-effort/);
    expect(privacy).toMatch(/not a guarantee/);
    expect(privacy).not.toMatch(/cannot be stored(?!\.)/i);
    expect(privacy).not.toMatch(/never (store|stored)|we never train|guaranteed/i);
  });

  it("says agents may keep what they read and that deleting here does not delete it there", () => {
    expect(privacy).toMatch(/own memory/);
    expect(privacy).toMatch(/Deleting here does not delete a copy/);
  });

  it("says rules are advice that agents may ignore, and that reports and comparisons can be inaccurate", () => {
    expect(privacy).toMatch(/Rules are advice\. An agent must ask for them and may ignore them/);
    expect(privacy).toMatch(/can be inaccurate/);
    expect(privacy).not.toMatch(/enforced|independent(ly)? (check|verif)/i);
  });

  it("is honest that the encryption is not end to end and that redaction is best-effort", () => {
    expect(privacy).toMatch(/not end-to-end encryption/);
    expect(privacy).toMatch(/can miss a name/);
  });

  it("does not claim a retention period it has not confirmed", () => {
    expect(privacy).not.toMatch(/35 days/);
    expect(privacy).toMatch(/we have not confirmed the period/);
  });

  it("uses no pet or livestock words", () => {
    expect(privacy + terms).not.toMatch(/tamagotchi|livestock|wrangl/i);
  });
});

describe("the Terms", () => {
  it("say rules are advice and that reports and comparisons can be inaccurate", () => {
    expect(terms).toMatch(/Agents may ignore your rules/);
    expect(terms).toMatch(/can be inaccurate/);
    expect(terms).toMatch(/does not execute, authorize, block or\s+reverse/);
  });

  it("do not ask for acceptance on the page itself (the box is on the One quick thing step)", () => {
    expect(terms).not.toMatch(/I agree|I accept/i);
  });
});
