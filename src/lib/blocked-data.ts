// The blocked-data check (spec FR-B2, section 9.3). It is best-effort: it can miss things and can flag harmless
// text, and no copy may call it a guarantee. It runs entirely inside our own code: no text is sent
// to any outside provider. A hit in the first group REJECTS the text; a hit in the second only WARNS
// and asks the person to confirm. When unsure it warns rather than stores.

export interface Finding {
  code: string;
  message: string;
}
export interface CheckResult {
  verdict: "ok" | "warn" | "reject";
  rejects: Finding[];
  warns: Finding[];
}

// ---- Reject: patterns for things the product never stores -------------------------------------------

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function ibanValid(raw: string): boolean {
  const s = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  return rem === 1;
}

const REJECT_RULES: { code: string; message: string; test: (text: string) => boolean }[] = [
  {
    code: "government_id",
    message: "This looks like a government ID number (such as a Social Security number). Please leave it out; we do not want to hold it.",
    test: (t) =>
      /\b\d{3}-\d{2}-\d{4}\b/.test(t) ||
      /\b(ssn|social security( number)?|sin|tax id|itin)\b\D{0,15}\d{9}\b/i.test(t) ||
      /\b(passport|driver'?s?\s+licen[sc]e|licen[sc]e\s+(number|no\.?|#)|national id)\b[^\n]{0,25}\b(?=[A-Z0-9]*\d)[A-Z0-9]{6,12}\b/i.test(t),
  },
  {
    code: "card_number",
    message: "This looks like a card number. Please leave it out; we do not want to hold card or bank details.",
    test: (t) => {
      for (const m of t.matchAll(/(?<![\d])(?:\d[ -]?){13,19}(?![\d])/g)) {
        const digits = m[0].replace(/\D/g, "");
        if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return true;
      }
      return false;
    },
  },
  {
    code: "bank_account",
    message: "This looks like a bank account, routing or IBAN number. Please leave it out; we do not want to hold card or bank details.",
    test: (t) =>
      /\b(routing|account|acct)\s*(number|no\.?|#)?\s*(is|:|=)?\s*\d{6,17}\b/i.test(t) ||
      [...t.matchAll(/\b[A-Za-z]{2}\d{2}(?:\s?[A-Za-z0-9]{2,4}){3,8}\b/g)].some((m) => ibanValid(m[0])),
  },
  {
    code: "password_or_code",
    message: "This looks like a password, PIN or security code. Please leave it out; we do not want to hold it.",
    test: (t) =>
      /\b(password|passwd|pwd|passcode|passphrase)\b\s*(is|are|:|=)\s*\S+/i.test(t) ||
      /\b(cvv|cvc|security code|pin)\b\D{0,10}\d{3,8}\b/i.test(t),
  },
  {
    code: "api_key",
    message: "This looks like a secret key or access token. Please leave it out; we do not want to hold it.",
    test: (t) =>
      /\b(sk-[A-Za-z0-9_-]{16,}|sk_(live|test)_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(t) ||
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/.test(t) ||
      /\b(api[ _-]?key|secret|token)\b\s*(is|:|=)\s*[A-Za-z0-9_\-+/=]{24,}/i.test(t),
  },
  {
    code: "insurance_id",
    message: "This looks like an insurance ID or policy number. Please leave it out; we do not want to hold it.",
    test: (t) =>
      /\b(member|subscriber|policy|group|insurance|medicare|medicaid)\s*(id|number|no\.?|#)\s*(is|:|=)?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,20}\b/i.test(t),
  },
  {
    code: "medical_record_number",
    message: "This looks like a medical record number. Please leave it out; we do not want to hold it.",
    test: (t) => /\b(mrn|medical record (number|no\.?|#)|patient (id|number))\b\D{0,15}\d{4,}/i.test(t),
  },
  {
    code: "test_results_or_clinical_document",
    message: "This looks like a test result or a clinical document (such as a lab report or a discharge summary). Please leave it out; we do not want to hold it.",
    test: (t) =>
      /\b(lab (results?|report)|discharge summary|pathology report|radiology report|biopsy results?|clinical notes?|(blood|lab|genetic|dna|covid|medical) test results?|a1c\s*(of|:|=|was|is)?\s*\d)/i.test(t),
  },
  {
    code: "full_date_of_birth",
    message: "This looks like a full date of birth. Please give only the birth year.",
    test: (t) =>
      /\b(born|birthday|birth\s*date|date of birth|dob)\b[^\n]{0,30}\b((0?[1-9]|1[0-2])[/.-](0?[1-9]|[12]\d|3[01])[/.-](19|20)\d{2}|(19|20)\d{2}-\d{2}-\d{2})\b/i.test(t),
  },
  {
    code: "precise_location",
    message: "This looks like exact map coordinates. Please leave it out; we do not want to hold exact locations.",
    test: (t) => /(?<![\d.])-?\d{1,3}\.\d{4,}\s*,\s*-?\d{1,3}\.\d{4,}(?![\d.])/.test(t),
  },
];

// ---- Warn: words that suggest health or money details (editable lists) ---------------------------------

export const HEALTH_TERMS = [
  "diagnos\\w*", "medication\\w*", "medicine", "prescri\\w+", "epipen", "celiac", "inhaler", "asthma\\w*", "diabet\\w+", "insulin",
  "cancer", "chronic", "surgery", "surgical", "therapy", "therapist", "pregnan\\w+", "mental health", "depress\\w+",
  "anxiety", "adhd", "autis\\w+", "disabilit\\w+", "epilep\\w+", "hiv", "medical", "condition", "symptom\\w*",
  "doctor'?s? notes?", "fingerprint\\w*", "face\\s?id", "retina\\w*", "biometric\\w*",
];
export const MONEY_TERMS = [
  "salary", "income", "paycheck", "wages?", "debt\\w*", "loan\\w*", "mortgage", "credit score", "bankrupt\\w*",
  "net worth", "savings", "balance", "owes?", "tax return\\w*", "invest\\w+", "portfolio", "401\\(?k\\)?", "bank account",
];

const wordsRegex = (terms: string[]) => new RegExp(`\\b(?:${terms.join("|")})\\b`, "i");
const HEALTH_RE = wordsRegex(HEALTH_TERMS);
const MONEY_RE = wordsRegex(MONEY_TERMS);

/**
 * The "never keep these" part of the check only (ID, card, bank, password, key, full date of birth, coordinates, insurance and record numbers,
 * test results). Used on text that is not a profile detail: rules, notes and task records. It never warns, so a spending limit such as
 * "ask me before spending over $50 on this card" always passes. Best-effort, like the rest of the check. Returns the first hit, or null.
 */
export function firstReject(text: string): Finding | null {
  const hit = checkText(text).rejects[0];
  return hit ?? null;
}

/** True when the text mentions something that looks like a health detail (conditions, medication, accommodations). Best-effort: it misses things and flags harmless text. */
export function looksSensitive(text: string): boolean {
  return HEALTH_RE.test(text);
}

export function checkText(text: string): CheckResult {
  const rejects = REJECT_RULES.filter((r) => r.test(text)).map(({ code, message }) => ({ code, message }));
  const warns: Finding[] = [];
  if (HEALTH_RE.test(text)) {
    warns.push({ code: "health_words", message: "This looks like a health detail. If you keep it, it is saved with a Sensitive label and starts limited to agents you choose, with none chosen yet. The check is best-effort, so it can miss things. Remove it, or confirm that you want it saved." });
  }
  if (MONEY_RE.test(text)) {
    warns.push({ code: "money_words", message: "This looks like a financial detail about you (a balance, income or debt). We discourage keeping these. Remove it, or confirm that you want it saved. Spending limits and budgets for your agents are fine." });
  }
  return { verdict: rejects.length ? "reject" : warns.length ? "warn" : "ok", rejects, warns };
}
