import { sanitizeText } from "./sanitize";
import { TASK_CATEGORIES } from "./tasks";

// How `get_rules` treats the optional `category` argument (spec 7.3, Appendix A).
// The argument is ADVISORY: it never hides a rule. Every rule the agent may see is returned. With a category, the rules
// that match it are listed first and flagged, and a plain note says so. `precedence_rank` is not touched here: it is
// always the rule's place in the full order of spec 6.4, whatever order the list is in.
// The wording must never say or imply that rules are enforced or optional (MCP is pull; rules are advice the person relies on).

const ADVICE =
  "These rules are advice from the person: nothing forces you to follow them, and the person is relying on you to.";

export interface Arranged<T> {
  rules: (T & { matches_requested_category?: boolean })[];
  /** Only present when a category was asked for. */
  note?: string;
}

export function arrangeRules<T extends { category: string }>(all: T[], requested: unknown): Arranged<T> {
  // The category comes from the agent: cleaned, shortened, and compared without regard to case or surrounding spaces.
  const asked = sanitizeText(requested, 40);
  if (!asked) return { rules: all };

  const wanted = asked.toLowerCase();
  const known = (TASK_CATEGORIES as readonly string[]).includes(wanted);
  const flagged = all.map((r) => ({ ...r, matches_requested_category: known && r.category.toLowerCase() === wanted }));
  // A stable split: matching rules first, the rest after, each group keeping the precedence order it arrived in.
  const rules = [...flagged.filter((r) => r.matches_requested_category), ...flagged.filter((r) => !r.matches_requested_category)];

  const note = known
    ? `Rules marked matches_requested_category: true are the best match for "${wanted}", but they are not the only rules that might matter, so read them all. ${ADVICE}`
    : `${JSON.stringify(asked)} is not one of the rule categories (${TASK_CATEGORIES.join(", ")}), so no rule is marked as matching and every rule is returned. Any of them might matter for this request. ${ADVICE}`;
  return { rules, note };
}
