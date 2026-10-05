import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import Privacy from "@/app/privacy/page";
import Terms from "@/app/terms/page";
import type { Db } from "@/db/client";
import { createTestDb } from "@/db/testing";
import { masterKeysFromEnv } from "./crypto";
import { exportAll } from "./data-export";
import { acceptTerms, findOrCreateUser, needsTermsStep } from "./identity";
import { ACCEPT_LABEL, CONTACT_LINE, OPERATOR_LINE, OTHER_PEOPLE_STATEMENT, S, SCORE_ORIGIN, TERMS_EFFECTIVE_DATE, TERMS_VERSION } from "./strings";

// The "One quick thing" step records which Terms version a person accepted, and when. Everyone accepts the CURRENT version once.

const read = (p: string) => fs.readFileSync(p, "utf8");
let db: Db;
beforeAll(async () => {
  db = await createTestDb();
});
const newUser = async () => findOrCreateUser(db, { authSubject: `terms_${crypto.randomUUID()}` });

describe("accepting the Terms is recorded with the version and the time", () => {
  it("the current version is 2026-10-03-2, so everyone who accepted 2026-10-03-1 accepts once more", async () => {
    expect(TERMS_VERSION).toBe("2026-10-03-2");
    const u = await newUser();
    await acceptTerms(db, u.id, "2026-10-03-beta-1", new Date("2026-10-03T12:00:00Z"));
    const [again] = [await findOrCreateUser(db, { authSubject: u.authSubject })];
    expect(needsTermsStep(again)).toBe(true); // accepted an older version: the step comes first
    const accepted = await acceptTerms(db, u.id, TERMS_VERSION, new Date("2026-10-04T12:00:00Z"));
    expect(needsTermsStep(accepted)).toBe(false);
    expect(accepted.termsVersion).toBe(TERMS_VERSION);
  });

  it("a new person must see the step; accepting records the current version and the time, and the step is gone", async () => {
    const u = await newUser();
    expect(needsTermsStep(u)).toBe(true);
    const at = new Date("2026-10-03T12:00:00Z");
    const accepted = await acceptTerms(db, u.id, TERMS_VERSION, at);
    expect(accepted.termsVersion).toBe(TERMS_VERSION);
    expect(accepted.termsAcceptedAt?.toISOString()).toBe(at.toISOString());
    expect(accepted.adultAttestedAt?.toISOString()).toBe(at.toISOString());
    expect(needsTermsStep(accepted)).toBe(false);
  });

  it("an account that confirmed adulthood before the Terms were versioned must still accept before anything else", () => {
    expect(needsTermsStep({ adultAttestedAt: new Date(), termsVersion: null })).toBe(true);
    expect(needsTermsStep({ adultAttestedAt: null, termsVersion: TERMS_VERSION })).toBe(true);
  });

  it("accepting for one person never changes another, and the export shows the version and time", async () => {
    const a = await newUser();
    const b = await newUser();
    await acceptTerms(db, a.id, TERMS_VERSION, new Date("2026-10-03T12:00:00Z"));
    expect((await findOrCreateUser(db, { authSubject: b.authSubject })).termsVersion).toBeNull();
    const doc = await exportAll(db, masterKeysFromEnv({ MASTER_KEY: Buffer.alloc(32, 7).toString("base64") }), a.id);
    expect(doc.account.terms_version_accepted).toBe(TERMS_VERSION);
    expect(new Date(doc.account.terms_accepted_at as Date).toISOString()).toBe("2026-10-03T12:00:00.000Z");
  });
});

describe("the One quick thing step", () => {
  const page = read("src/app/welcome/page.tsx");
  const action = read("src/app/welcome/actions.ts");

  it("has one clear unchecked box with the agreed words, and both names are links (owner decision 6, 2026-10-04)", () => {
    expect(ACCEPT_LABEL).toBe("I am 18 or older and agree to the Terms and Privacy Notice.");
    expect(S.onb.signup.agree[0] + S.onb.signup.terms + S.onb.signup.agree[1] + S.onb.signup.privacy + S.onb.signup.agree[2]).toBe(ACCEPT_LABEL);
    expect(page).toContain("G.agree[0]");
    expect(page).toContain('name="accept"');
    expect(page).not.toMatch(/defaultChecked|checked=/);
    expect(page.match(/type="checkbox"/g)).toHaveLength(1); // one box only
    expect(page).toContain('href="/privacy"');
    expect(page).toContain('href="/terms"');
    expect(page).not.toContain("PRIVACY_NOTICE_NOTICE");
  });

  it("will not continue unless the box is ticked, and records the version the server is running, not one sent by the form", () => {
    expect(action).toContain('formData.get("accept") !== "on"');
    expect(action).toContain("acceptTermsFor(session.person.id)");
    expect(action).not.toMatch(/formData\.get\("(version|terms)/);
  });

  it("every signed-in page sends a person who has not accepted the current Terms here first", () => {
    expect(read("src/lib/session.ts")).toContain("needsTermsStep(person)");
    expect(read("src/lib/session.ts")).toContain('redirect("/welcome")');
    expect(read("src/app/page.tsx")).toContain('redirect("/welcome")');
  });

  it("a Privacy and Terms footer is on every page, without the word draft", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).toContain('href="/privacy"');
    expect(layout).toContain('href="/terms"');
    expect(layout).not.toMatch(/draft/i);
  });
});

describe("the Terms and the Privacy Notice", () => {
  const terms = renderToStaticMarkup(createElement(Terms));
  const privacy = renderToStaticMarkup(createElement(Privacy));
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");

  it("start with their own title: no banner or notice box at the top of either page", () => {
    for (const html of [terms, privacy]) {
      expect(html).toMatch(/^<main[^>]*><h1>/);
      expect(html).not.toContain('role="note"');
    }
    expect(terms).toContain("<h1>Rare Tomato Terms</h1>");
    expect(privacy).toContain("<h1>Rare Tomato Privacy Notice</h1>");
  });

  it("state the operator, the contact and today's effective date, with no company type and no bracketed placeholder", () => {
    expect(OPERATOR_LINE).toBe("Operator: Rare Tomato, Cleveland, Ohio, USA.");
    expect(CONTACT_LINE).toBe("Privacy, support and requests: support@raretomato.ai.");
    for (const html of [terms, privacy]) {
      expect(html).toContain(OPERATOR_LINE);
      expect(html).toContain(`Effective date: ${TERMS_EFFECTIVE_DATE}`);
      expect(html).not.toMatch(/\b(Inc|LLC|Ltd|Corp)\b/);
      expect(html).not.toMatch(/\[[^\]]{1,60}\]/);
    }
    expect(privacy).toContain(CONTACT_LINE);
    expect(terms).toContain(CONTACT_LINE);
    expect(terms).toContain(`Version ${TERMS_VERSION}`);
  });

  it("have no governing-law line, no arbitration, no class-action waiver and no liability cap", () => {
    expect(terms + privacy).not.toMatch(/governing law|governed by|arbitrat|class[- ]action|waive|liability (is )?(limited|capped)|cap on liability/i);
    expect(terms).toContain("nothing here excludes liability that cannot lawfully be excluded");
  });

  it("say who produces a score, and the permission rule for other people's details", () => {
    expect(terms).toContain(esc(SCORE_ORIGIN));
    expect(privacy).toContain(esc(SCORE_ORIGIN));
    expect(SCORE_ORIGIN).toMatch(/Rare Tomato's own check/);
    expect(SCORE_ORIGIN).toMatch(/the agent does not produce the score/);
    expect(terms).toContain(OTHER_PEOPLE_STATEMENT);
    expect(privacy).toContain(OTHER_PEOPLE_STATEMENT);
  });

  it("the Terms have the nine sections", () => {
    const heads = [...terms.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1]);
    expect(heads).toEqual([
      "1. Agreement and eligibility", "2. What the service does", "3. Accounts and agent connections", "4. Your content", "5. Acceptable use",
      "6. Provided as is", "7. Suspension, closure and changes", "8. Warranties and responsibility", "9. Contact",
    ]);
  });

  it("the Privacy Notice covers who it applies to, the storage table wording, encryption, providers, rights and cookies as agreed", () => {
    for (const needle of [
      "Who this covers", "people whose information is added by a user or by an agent", "Not encrypted at the application field level",
      "not end-to-end encryption", "No security measure removes every risk", "Where information comes from", "A Sensitive label is a prompt, not a guarantee",
      "We do not provide a specialized health-data consent process", "AWS us-east-1", "6 hours", "Washington, D.C.", "We have not confirmed written data-processing terms with each provider",
      "email support@raretomato.ai, including if information about you was added by someone else and you have no account", "local data protection authority",
      "Rare Tomato runs in the United States", "We have not confirmed transfer arrangements", "Children cannot create accounts or connect agents",
      "wos-session", "wos-auth-verifier", "rt_session_cleared", "rt-install-card-dismissed", "__cf_bm", "Up to 30 days", "Our public pages set no cookies",
      "Generated rule drafts", "Request and connection data our host records", "Support emails",
    ]) expect(privacy, needle).toContain(needle);
    expect(privacy).not.toContain("Readable");
    expect(privacy).not.toContain("TypeSafe");
    expect(privacy).not.toContain("master key");
  });

  it("the Anthropic paragraph lists the verified payloads and says retention statements are not verified for our setup", () => {
    expect(privacy).toContain("Rule draft");
    expect(privacy).toContain("up to ten of your approved rules");
    expect(privacy).toMatch(/Overlap check[\s\S]*&quot;when it applies&quot; line of both rules, not redacted/);
    expect(privacy).toMatch(/Scoring[\s\S]*after we replace names/);
    expect(privacy).toContain("we have not verified them for our");
    expect(privacy).toContain("separate from any Claude account or agent you connect yourself");
  });
});
