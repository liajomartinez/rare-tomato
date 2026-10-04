// Text that comes from an agent is UNTRUSTED (spec FR-C3, 6.7). Before it is stored we strip anything that
// could hide or fake content: control characters, invisible and direction-changing characters, and markup.
// It is always shown as plain text and links are never followed or made clickable.

// Characters that are invisible or change how text reads: zero-width, direction overrides and isolates,
// line and paragraph separators, byte-order mark, word joiner, soft hyphen and related.
const INVISIBLE = new RegExp("[\u200B-\u200F\u2028-\u202E\u2060-\u2064\u2066-\u2069\u206A-\u206F\uFEFF\u00AD\u061C\u180E]", "g");
// Control characters except newline and tab.
const CONTROL = new RegExp("[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]", "g");

export function stripMarkup(text: string): string {
  let out = text;
  // Repeat so that nested or split tags such as "<scr<script>ipt>" cannot survive a single pass.
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/<!--[\s\S]*?-->/g, "").replace(/<\/?[A-Za-z!?][^<>]*>?/g, "");
    if (next === out) break;
    out = next;
  }
  return out;
}

export function sanitizeText(input: unknown, maxLength: number): string {
  if (typeof input !== "string") return "";
  const cleaned = stripMarkup(input.normalize("NFC").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(INVISIBLE, ""))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.length > maxLength ? cleaned.slice(0, maxLength) : cleaned;
}
