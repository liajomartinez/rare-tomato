import { describe, expect, it } from "vitest";
import { checkText, firstReject, looksSensitive } from "./blocked-data";

// Only obvious, fictional examples belong here. Doubtful or ambiguous wording is deliberately NOT tested
// yet: Lia writes the expected answers for those in the evaluation sets (spec 12.1).

const verdict = (text: string) => checkText(text).verdict;
const codes = (text: string) => checkText(text).rejects.map((r) => r.code);

describe("rejects what we never store", () => {
  it.each([
    ["a US-format Social Security number", "SSN 123-45-6789", "government_id"],
    ["a nine-digit number after 'social security'", "social security number 123456789", "government_id"],
    ["a passport number", "Passport number X1234567", "government_id"],
    ["a Visa test card number", "card 4111 1111 1111 1111", "card_number"],
    ["a test card number with dashes", "4242-4242-4242-4242", "card_number"],
    ["an account number", "bank account number 12345678", "bank_account"],
    ["a routing number", "routing number 021000021", "bank_account"],
    ["a valid IBAN", "GB82 WEST 1234 5698 7654 32", "bank_account"],
    ["a stated password", "my password is hunter2", "password_or_code"],
    ["a stated PIN", "PIN is 4821", "password_or_code"],
    ["a security code", "CVV 123", "password_or_code"],
    ["a secret key in the style of a live key", ["sk", "test", "FAKEFAKEFAKEFAKEFAKEFAKE"].join("_"), "api_key"],
    ["an access key id", ["AKIA", "IOSFODNN7EXAMPLE"].join(""), "api_key"],
    ["a full date of birth", "Mia was born 03/14/2019", "full_date_of_birth"],
    ["map coordinates", "home is 40.712776, -74.005974", "precise_location"],
  ])("%s", (_name, text, code) => {
    const result = checkText(text);
    expect(result.verdict).toBe("reject");
    expect(codes(text)).toContain(code);
  });

  it("gives a plain-language reason for every rejection", () => {
    for (const finding of checkText("my password is hunter2").rejects) expect(finding.message.length).toBeGreaterThan(20);
  });
});

describe("warns on words that suggest health or money details", () => {
  it.each([
    ["a medication", "Sam takes medication every morning"],
    ["a condition", "Mia has asthma and uses an inhaler"],
    ["a diagnosis", "the diagnosis was last year"],
    ["a salary", "Dana's salary is confidential"],
    ["a mortgage", "we are paying off a mortgage"],
    ["a credit score", "worried about my credit score"],
  ])("%s", (_name, text) => {
    expect(verdict(text)).toBe("warn");
  });

  it("names the kind of detail it suspects", () => {
    expect(checkText("has asthma").warns[0].code).toBe("health_words");
    expect(checkText("my income").warns[0].code).toBe("money_words");
  });

  it("a reject beats a warn", () => {
    expect(verdict("my password is hunter2 and my salary is high")).toBe("reject");
  });
});

describe("dietary preferences versus health details (Option B, decided 2026-10-02)", () => {
  it("a plain household dietary preference does not warn", () => {
    for (const text of ["Our household avoids dairy", "Dairy: our household avoids dairy", "Household is vegetarian"]) {
      expect(checkText(text).verdict).toBe("ok");
    }
  });

  it("dietary needs and allergies save with no warning", () => {
    for (const text of ["Theo has a dairy allergy", "Thomas has a dairy allergy", "severe peanut allergy", "lactose intolerant", "no pork", "Vegetarian"]) {
      expect(checkText(text).verdict).toBe("ok");
    }
  });

  it("a diagnosis or medication around the same food still warns", () => {
    for (const text of ["Dairy intolerance diagnosed last year", "Takes medication with dairy"]) {
      expect(checkText(text).verdict).toBe("warn");
    }
  });
});

describe("allows ordinary details", () => {
  it.each([
    "Prefers text over calls",
    "Wants appointment confirmations by email",
    "Mornings before 10 am are off limits for appointments",
    "Mia has soccer on Tuesdays after school",
    "Theo needs 15 minutes of notice before leaving",
    "Casual tone with friends, formal with the school",
    "Sam (partner), born 1988",
    "Dentist office phone (555) 010-1234",
    "Meeting on 10/15/2026 at 3 pm",
    "Confirmation number 1234567 for the booking",
    "Order 4111 was delivered",
    "Vegetarian",
    "Vegan, no fish or eggs",
    "Prefers oat milk in coffee",
    "Halal meals only",
    "Keeps kosher at home",
    "Dislikes spicy food",
    "Gluten-free bread when possible",
    "Likes to eat early, around 6 pm",
    "Our household avoids dairy",
    "Household is vegetarian",
    "We avoid gluten at home",
    "Food: our household avoids dairy and eggs",
  ])("%s", (text) => {
    expect(verdict(text)).toBe("ok");
  });

  it("does not treat a 16-digit number that fails the card check as a card", () => {
    expect(verdict("reference 1234 5678 9012 3456")).toBe("ok");
  });

  it("does not treat an ordinary date as a date of birth", () => {
    expect(codes("the school event is on 09/15/2026")).not.toContain("full_date_of_birth");
  });
});

describe("Option B: health details warn and are labeled; records and documents are rejected (SPEC 9.3)", () => {
  it.each([
    "Mia has asthma; give her the inhaler at 3pm",
    "takes her medication at 3pm",
    "carries an EpiPen",
    "celiac, needs gluten-free food",
    "Theo has diabetes and takes insulin at 8am",
  ])("warns and looks sensitive: %s", (text) => {
    const r = checkText(text);
    expect(r.verdict).toBe("warn");
    expect(r.warns[0].code).toBe("health_words");
    expect(looksSensitive(text)).toBe(true);
  });

  it.each([
    ["an insurance member ID", "member ID 12345678", "insurance_id"],
    ["a policy number", "policy number A1234567", "insurance_id"],
    ["a medical record number", "MRN 0098765", "medical_record_number"],
    ["a lab result", "lab results: A1C 7.2", "test_results_or_clinical_document"],
    ["a discharge summary", "discharge summary attached", "test_results_or_clinical_document"],
  ])("rejects %s", (_name, text, code) => {
    const r = checkText(text);
    expect(r.verdict).toBe("reject");
    expect(r.rejects.map((x) => x.code)).toContain(code);
  });

  it("a mixed text with a record number is rejected as a whole; with only a medication it warns", () => {
    expect(checkText("peanut allergy, MRN 0098765").verdict).toBe("reject");
    expect(checkText("peanut allergy, takes insulin at 8am").verdict).toBe("warn");
  });

  it("spending limits, budgets and prices are not flagged; a balance, income or debt warns; a card number is rejected", () => {
    expect(checkText("Don't spend over $50 on this card").verdict).toBe("ok");
    expect(checkText("Ask me before anything over a $200 budget").verdict).toBe("ok");
    expect(checkText("My balance is low and I have debt").warns[0].code).toBe("money_words");
    expect(checkText("card 4111 1111 1111 1111").verdict).toBe("reject");
  });

  it("known misses are recorded here so nobody believes the check is more than it is", () => {
    // Best-effort: these are NOT caught today. If one starts being caught, update this test and the privacy copy.
    expect(looksSensitive("blood sugar issues")).toBe(false);
    expect(looksSensitive("takes Lipitor each night")).toBe(false);
    expect(checkText("insurance 99887766").verdict).toBe("ok"); // an unlabeled number
  });

  it("harmless text with a listed word warns (one tap to confirm)", () => {
    expect(checkText("Medical appointments are fixed on Tuesdays").verdict).toBe("warn");
  });
});

describe("firstReject: the never-keep part of the check, for rules, notes and task records", () => {
  it("returns a hit for ID, card and password text and null for ordinary text", () => {
    expect(firstReject("card 4111 1111 1111 1111")?.code).toBe("card_number");
    expect(firstReject("my password is hunter2")?.code).toBe("password_or_code");
    expect(firstReject("Booked the dentist for Tuesday at 2pm")).toBeNull();
  });

  it("never blocks a spending limit, a budget or a health word (those are not its job)", () => {
    for (const text of ["Ask me before spending over $50 on this card", "Never buy anything over a $200 budget", "Mia has asthma", "Theo has a dairy allergy"]) {
      expect(firstReject(text)).toBeNull();
    }
  });
});
