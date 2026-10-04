import { describe, expect, it } from "vitest";
import { namesFromText, redact } from "./redact";

// Only fictional people, addresses and numbers (SPEC D12, Appendix E). Redaction is best-effort: these tests prove it catches the
// listed kinds, and the "known misses" test records what it does not catch so nobody trusts it more than it deserves.

const ctx = { knownNames: ["Theo", "Priya", "Rivera"] };

describe("redaction replaces names, emails, phone numbers, addresses and dates of birth", () => {
  it("emails", () => {
    const r = redact("Sent the form to priya.rivera@example.test and cc'd dana@example.org", ctx);
    expect(r.text).not.toContain("@");
    expect(r.text).toContain("{email}");
    expect(r.counts.email).toBe(2);
  });

  it.each([
    ["a US number with dashes", "Called 555-010-1234 and left a voicemail"],
    ["a number with brackets", "Texted (555) 010-1234 about the pickup"],
    ["an international number", "Their number is +44 20 7946 0958"],
    ["a plain run of digits with spaces", "Phone 555 010 1234"],
  ])("phone numbers: %s", (_n, text) => {
    const r = redact(text, ctx);
    expect(r.text).toContain("{phone}");
    expect(r.text).not.toMatch(/\d{3}[\s.-]?\d{3,4}/);
  });

  it.each([
    ["a street address", "Delivered to 42 Maple Street yesterday", "42 Maple"],
    ["an abbreviated street with a unit", "Pickup at 1200 Oak Ave Apt 4B", "1200 Oak"],
    ["a PO box", "Mail it to PO Box 77", "Box 77"],
    ["a city, state and zip", "Ship to Springfield, IL 62704", "62704"],
  ])("addresses: %s", (_n, text, gone) => {
    const r = redact(text, ctx);
    expect(r.text).toContain("{address}");
    expect(r.text).not.toContain(gone);
  });

  it.each([
    ["a numeric full date", "Mia was born 03/14/2019", "03/14/2019"],
    ["an ISO date", "Date of birth 2019-03-14", "2019-03-14"],
    ["a written date", "Born March 14, 2019", "March 14, 2019"],
  ])("dates of birth: %s", (_n, text, gone) => {
    const r = redact(text, ctx);
    expect(r.text).toContain("{date}");
    expect(r.text).not.toContain(gone);
  });

  it("names the person told us about, in any case and as a possessive", () => {
    const r = redact("Asked THEO about it, then emailed priya's school. Rivera confirmed.", ctx);
    expect(r.text).not.toMatch(/theo|priya|rivera/i);
    expect(r.text).toContain("{person_");
  });

  it("names we were NOT told about, by the cautious capital-letter pattern", () => {
    const r = redact("Booked a table with Dana and Marcus for Tuesday", { knownNames: [] });
    expect(r.text).not.toContain("Dana");
    expect(r.text).not.toContain("Marcus");
    expect(r.text).toContain("Tuesday"); // weekdays are not names
  });

  it("keeps the meaning words a scorer needs", () => {
    const r = redact("Booked the dentist appointment for 8:00 am next Tuesday", { knownNames: [] });
    expect(r.text).toBe("Booked the dentist appointment for 8:00 am next Tuesday");
  });

  it("reports counts only: the result never carries the original values", () => {
    const r = redact("Theo's number is 555-010-1234, email theo@example.test", ctx);
    expect(Object.keys(r).sort()).toEqual(["counts", "text"]);
    expect(JSON.stringify(r.counts)).not.toMatch(/theo|555|@/i);
  });

  it("is safe on empty and placeholder-only text", () => {
    expect(redact("", ctx).text).toBe("");
    expect(redact("{person_1} called", ctx).text).toBe("{person_1} called");
  });
});

describe("what redaction does NOT catch (recorded so nobody believes it is a guarantee)", () => {
  it("a lowercase name, a nickname written as a common word, or an address with no street word is not caught", () => {
    expect(redact("asked marcus about it", { knownNames: [] }).text).toContain("marcus");
    expect(redact("Lives at 12 the green house", { knownNames: [] }).text).toContain("12");
  });
});

describe("namesFromText", () => {
  it("collects capitalized words that are not ordinary words", () => {
    expect(namesFromText("Dr. Rivera, school nurse", "Theo needs notice on Tuesday")).toEqual(expect.arrayContaining(["Rivera", "Theo"]));
    expect(namesFromText("Needs notice on Tuesday")).not.toContain("Tuesday");
  });
});
