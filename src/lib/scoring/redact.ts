// Redaction before any scoring call (spec 6.5, FR-F1, release gate 12.6). Names, emails, phone numbers, street addresses and dates of
// birth are replaced with placeholders BEFORE text leaves our service. The map from placeholder back to the real value is never
// kept: scoring only needs the placeholders, so there is nothing to send, store or log.
//
// BEST-EFFORT. It can miss a name or an address written in an unusual way, and it can hide harmless words. It is a test gate on test
// data, not a guarantee about real text, and no screen may describe it as one.

export interface RedactionContext {
  /** Names the person has told us about (from their own details), so they are caught wherever they appear. */
  knownNames: string[];
}

// Capitalized words that are NOT names: weekdays, months, and ordinary words that start a sentence in an agent's report.
const NOT_A_NAME = new Set(
  (
    "monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december " +
    "the a an and or but if in on at to for of with from by as is was were are be been it its this that these those i we you he she they " +
    "no yes not never always ask asked asking tell told said sent send sending booked book booking called call calling emailed email texted text " +
    "scheduled schedule cancelled canceled paid pay paying ordered order ordering bought buy declined declining agreed agree checked check " +
    "found find reviewed review confirmed confirm rescheduled reminded remind drafted draft replied reply forwarded forward added add removed " +
    "remove updated update created create looked look searched search compared compare shared share signed sign submitted submit posted post " +
    "made make set setting arranged arrange planned plan prepared prepare reserved reserve picked pick gave give took take got get " +
    "did do does done will would should could can may might must also then after before when while because so " +
    "morning afternoon evening night today tomorrow yesterday noon midnight am pm dentist doctor school office store shop appointment dinner lunch breakfast " +
    "gift meal monitor listing buyer seller price offer discount pickup delivery"
  ).split(" "),
);

const SUFFIXES = "Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Way|Place|Pl|Terrace|Ter|Circle|Cir|Highway|Hwy|Parkway|Pkwy";
const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;
const LINK = /\b(?:https?:\/\/|www\.)\S+/gi;
const PHONE = /(?<![\w])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?![\w])/g;
const STREET = new RegExp(`\\b\\d{1,6}\\s+(?:[A-Za-z0-9'.-]+\\s+){0,4}(?:${SUFFIXES})\\b\\.?(?:,?\\s*(?:Apt|Unit|Suite|Ste|#)\\s*[\\w-]+)?`, "gi");
const PO_BOX = /\bP\.?\s?O\.?\s+Box\s+\d+\b/gi;
const CITY_STATE_ZIP = /\b[A-Z][A-Za-z.' -]+,\s*[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/g;
const ZIP = /(?<=\b[A-Z]{2}\s)\d{5}(?:-\d{4})?\b/g;
const DATE_NUMERIC = /\b(?:\d{1,2}[/.-]\d{1,2}[/.-](?:19|20)\d{2}|(?:19|20)\d{2}[/.-]\d{1,2}[/.-]\d{1,2})\b/g;
const DATE_WORDS = new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(?:19|20)\\d{2}\\b|\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?,?\\s+(?:19|20)\\d{2}\\b`, "gi");

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits the given names into single words worth catching (2+ letters, not a common word). */
export function namesFromText(...texts: string[]): string[] {
  const out = new Set<string>();
  for (const text of texts) {
    for (const m of text.matchAll(/\b[A-Z][a-z]{1,}(?:['-][A-Za-z]+)?\b/g)) {
      const w = m[0];
      if (!NOT_A_NAME.has(w.toLowerCase())) out.add(w);
    }
  }
  return [...out];
}

export interface Redacted {
  text: string;
  /** How many of each kind were replaced. Counts only: never the originals. */
  counts: Record<string, number>;
}

export function redact(input: string, ctx: RedactionContext = { knownNames: [] }): Redacted {
  const counts: Record<string, number> = {};
  const hit = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
  };
  let out = input;
  const sub = (re: RegExp, placeholder: string, kind: string) => {
    out = out.replace(re, () => {
      hit(kind);
      return placeholder;
    });
  };

  sub(EMAIL, "{email}", "email");
  sub(LINK, "{link}", "link");
  sub(DATE_WORDS, "{date}", "date");
  sub(DATE_NUMERIC, "{date}", "date");
  sub(PO_BOX, "{address}", "address");
  sub(STREET, "{address}", "address");
  sub(CITY_STATE_ZIP, "{address}", "address");
  sub(ZIP, "{address}", "address");
  sub(PHONE, "{phone}", "phone");

  // Names the person told us about, wherever they appear (each gets a stable placeholder inside this one text).
  const known = [...new Set(ctx.knownNames.map((n) => n.trim()).filter((n) => n.length >= 2 && !NOT_A_NAME.has(n.toLowerCase())))].sort((a, b) => b.length - a.length);
  known.forEach((name, i) => {
    sub(new RegExp(`(?<![\\w])${escapeRe(name)}(?:'s)?(?![\\w])`, "gi"), `{person_${i + 1}}`, "name");
  });

  // Cautious pattern for names we were not told about: a capitalized word that is not an ordinary word. Sentence starts count too,
  // except ordinary report words. This hides some harmless words on purpose; hiding too much is the safe error here.
  out = out.replace(/(?<![\w{])([A-Z][a-z]+(?:['-][A-Za-z]+)?)(?![\w}])/g, (word) => {
    const lower = word.toLowerCase();
    if (NOT_A_NAME.has(lower) || /(?:ed|ing)$/.test(lower)) return word;
    hit("name");
    return "{name}";
  });

  return { text: out, counts };
}
