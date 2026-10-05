// The shortest path from a mistake to an approved rule, as the product is built (spec FR-D6, success metric "effort to fix").
// Kept as data so a test can check it against the real screens and so the number cannot drift unnoticed.

/** Where a person lands after a rule is drafted from their feedback: the top of Your rules, where the new rule waits for their Save (it is not served until then). */
export const proposalUrl = (ruleId: string) => `/rules?draft=${encodeURIComponent(ruleId)}`;

export const TAP_TARGET = 4;

/** Typing a note is optional and is not a tap. */
export const FIX_IT_TAP_PATH = [
  { tap: 1, what: "Tap Not right on a task card in the feed", where: "src/app/feed/FeedbackForm.tsx", marker: "S.feed.down" },
  { tap: 2, what: "Tick one reason", where: "src/app/feed/FeedbackForm.tsx", marker: 'name="reason"' },
  { tap: 3, what: "Tap Draft a rule (a note is optional; the feedback is saved, a rule is drafted from the reason and the page opens Your rules with it)", where: "src/app/feed/FeedbackForm.tsx", marker: "H.cta" },
  { tap: 4, what: "Tap Save rule on the proposed rule", where: "src/app/rules/page.tsx", marker: "S.rules.save" },
] as const;
