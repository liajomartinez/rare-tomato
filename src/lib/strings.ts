// The one place for the user-facing sentences that appear on more than one screen (honest limits, labels, notes).
// Screens import these instead of writing their own, so a wording change is a one-line change and a copy test can check them all.
//
// House rules (CLAUDE.md, SPEC 6.7, 9.3): MCP is pull and rules are advice, so never say a rule is enforced or followed; scores are
// agent-reported, never verified or independent; the blocked-data check is best-effort, never a guarantee. No pet, tamagotchi,
// livestock or "wrangling" words. Decided by Lia, 2026-10-03: the verb for turning a correction into a rule (O1) and the score-band
// words (O2). Still open: the name "Care sheet" (O6), so it lives in ONE constant below and nothing else spells it out.

export const PRODUCT_NAME = "Rare Tomato";
export const MENU_LABEL = "Menu";

/** The in-product verb for turning a correction into a rule (O1, decided by Lia 2026-10-03). */
export const SAVE_AS_RULE = "Save as a rule";

/** The name of the copy-and-paste sheet (O6, NOT decided: Lia is renaming it). Change it here only. */
export const CARE_SHEET_NAME = "Care sheet";
export const CARE_SHEET_NAME_LOWER = CARE_SHEET_NAME.toLowerCase();

/**
 * The words for the score bands (O2, Set C, decided by Lia 2026-10-03). Index 0 is stage 0 (fewer than five scored checks: no number is
 * shown); indexes 1 to 5 are the five scored bands, in order.
 */
export const SCORE_BAND_LABELS = ["Still learning", "Needs attention", "Fair", "Okay", "Good", "Very good"] as const;

/** The label that sits next to every task and every score (FR-F6). */
export const AGENT_REPORTED = "agent-reported";

/** The coverage note that sits next to every score (FR-F7). */
export function coverageNote(tasksLogged: number): string {
  return `${tasksLogged} ${tasksLogged === 1 ? "task" : "tasks"} logged. Anything your agents did not log is not visible here.`;
}

export const RULES_ADVISORY =
  "A rule is advice you have approved for how your agents should act for you. Agents can read your rules when they ask, but nothing forces an agent to follow one, and we cannot see whether it did.";

export const RULES_SHORT_NOTE =
  "Rules are advisory. An agent has to ask for them and can choose not to. What an agent reports about its own work is agent-reported.";

export const FEED_NOTE =
  "Everything here is what your agents told us they did (agent-reported). Anything an agent did not report is not shown, and background work may never be reported.";

export const BLOCKED_CHECK_NOTE =
  "Dietary needs and allergies are fine to add. Please do not enter ID numbers, card or bank details, passwords, insurance or medical record numbers, or test results; those are turned away. Other health details and money details (balances, income, debts) are saved only after you confirm. The check is best-effort: it can miss things and can flag harmless text, so it is not a guarantee.";

export const AGENT_MEMORY_NOTE = "Deleting here does not delete a copy an agent has kept in its own memory.";

export const NOT_END_TO_END =
  "Your details are stored encrypted, but our servers can decrypt them in order to pass them to your agents. This is not end-to-end encryption.";

/** What we saw with Muse, as counts from our own tests (the project notes). Muse's own wording is its own report. */
export const MUSE_STALE_LINE = "Muse may stop connecting after an hour or two. If it does, reconnect it here.";

export const MUSE_OBSERVED =
  "What we saw in our tests: Muse stopped connecting three times, about 74, 93 and 107 minutes after a working connection. Each time our server refused what it received as not a valid sign-in token (the last two times it was a short text with no dots). We do not yet know why it happens, and we cannot see inside Muse. This is what we saw, not a promise about what will happen to you.";

export const MUSE_RECONNECT_HEADING = "Reconnect Muse";
export const MUSE_RECONNECT_STEPS = [
  "In Muse, open Settings, then Connectors, then Rare Tomato, then Disconnect.",
  "In a chat, ask Muse to set up the custom connector at the address shown on this page.",
  "Choose Connect.",
  "Approve on the sign-in page, with the same account you use here.",
  "Come back here and confirm it. If it appears as new, choose \"This replaces my old Muse\".",
] as const;

/** Said when Muse has not been heard from for a while. Quiet is normal (Muse only calls when asked), so this does not say it went stale. */
export function museQuietNote(hours: number): string {
  return `We have not heard from Muse for about ${hours} ${hours === 1 ? "hour" : "hours"}. That can simply mean it was not asked to use Rare Tomato, or that its connection stopped. If you expected it to call, reconnect it.`;
}

export const MUSE_TIMED_OUT_HEADING = "Muse timed out";
export const MUSE_TIMED_OUT_NOTE = "Muse signed in but was not confirmed in time, so it was turned off. Remove it here, then reconnect it with the steps below.";
export const MUSE_TIMED_OUT_BUTTON = "Remove it, then reconnect Muse";

/** The whole Muse limit in one sentence, for the guide and the Honest limits lists. */
export const MUSE_LIMIT = `${MUSE_STALE_LINE} ${MUSE_OBSERVED} Reconnect: in Muse open Settings, Connectors, Rare Tomato, Disconnect; ask Muse in a chat to set up the connector again; choose Connect; approve on the sign-in page; confirm it on Your agents with "This replaces my old Muse".`;

export const SCORE_PAUSED = "Scoring is paused for now. Your feedback is still saved.";
export const STILL_LEARNING = `${SCORE_BAND_LABELS[0]}. Give it a few tasks.`;

/** Said on a new agent that has signed in but is not confirmed yet. The time limit is the one the product computes, never typed by hand. */
export function unconfirmedAgentNote(expiresAtLabel: string | null, lifetimeDays: number): string {
  const limit = `An agent you do not confirm stops working after ${lifetimeDays} ${lifetimeDays === 1 ? "day" : "days"}.`;
  return expiresAtLabel ? `${limit} For this one that is ${expiresAtLabel}.` : limit;
}

/** The word a person types to confirm deleting their account (Settings and data). */
export const DELETE_PHRASE = "DELETE";

// ---- Starter-line step (O7, approved by Lia in autonomous run #2, 2026-10-03) ----

/** The approved line, exactly as in the project notes Changing a word needs Lia's approval. */
export const STARTER_LINE =
  "At the start of any task you do for me, including drafts, plans and lists, check my Rare Tomato rules (get_rules) and saved details (get_care_profile) first, then record what you did with log_task.";

/** The check to run in a fresh chat after pasting the line (the project notes, "Instruction check"). */
export const NO_TOOLS_CHECK_QUESTION = "What do my saved preferences (or custom instructions) say about Rare Tomato? Do not call any tools.";

export const NO_TOOLS_CHECK_GOOD_REPLY =
  "A good reply repeats the line: check get_rules and get_care_profile first, then record with log_task. It should also say it did not call any tools. If it says it has nothing saved about Rare Tomato, the line is not in place yet.";

export const STARTER_WHY =
  "Agents only look at your rules when they are told to. In our small test (six tasks each for Claude and ChatGPT, so it points a direction and proves nothing), both asked for the rules and details on every task when this line was in their own instructions, and asked on none in our earlier tests without it (those ran at other times, so the comparison is rough).";

export const STARTER_LIMITS = [
  "Advice, not enforcement: even with the line, an agent can skip it, and we cannot see whether it followed a rule it read.",
  "Only requests that reach our server show up below. We cannot see inside the agent, so we cannot tell whether you pasted the line.",
  "The line goes in the agent's own settings. You paste it there; Rare Tomato cannot do that for you.",
];

export const STARTER_PLACEMENT_UNVERIFIED = "We have not checked where this goes in this agent yet, so we are not guessing a menu name. Look for the place where it keeps your own standing instructions, or paste the line at the start of a chat.";

export const SETUP_NOT_FINISHED = "Set up: not finished";
export const SETUP_NOT_FINISHED_HELP = "We have not seen it ask for your rules or details yet.";
export function setupWorking(dateLabel: string, asked: "rules" | "details"): string {
  return `Working: it asked for your ${asked} on ${dateLabel}`;
}
export function agentsNeedStep(n: number): string {
  return `${n} ${n === 1 ? "agent needs" : "agents need"} one more step`;
}

// ---- "Only to agents I choose" (open item 19) ----
export const VISIBILITY_ALL = "Every agent that can read this kind of detail";
export const VISIBILITY_CHOSEN = "Only the agents I choose";
export const CARE_SHEET_LIMITED_NOTE = "Details you limited to chosen agents are left off this sheet, so it may look shorter than your list. A new Sensitive detail with no agent chosen is added only when you tick the box for Sensitive details.";
export const VISIBILITY_NOTE =
  "An agent you leave out gets nothing for this detail: it is left out of the reply, with no hint that it exists. This does not delete a copy an agent already kept. A detail limited like this is also left off the " +
  "sheet you copy for agents that cannot connect. If an agent is replaced or you reconnect it, choose again: nothing carries over to the new connection.";
export const VISIBILITY_SENSITIVE_HINT =
  "A new health detail starts limited to agents you choose, with none chosen. After you save it, tick the agents that may read it on its card.";

// ---- Run #6 ----

/** Run 7 (Lia, 2026-10-03): a note on a thumbs-down is optional, and there is no queue of waiting drafts. */
export const DRAFTING_RULE = "Drafting your rule\u2026";
export const DRAFT_FAILED = "We could not draft a rule. Add a few words and tap \u{1F44E} again.";
export const DRAFT_GONE = "That draft is not here any more. Tap \u{1F44E} again if you still want a rule.";
export const NOT_NOW_BANNER = "Not saved. Nothing was added to your rules.";
export const DRAFT_HEADING = "Your new rule (not saved yet)";
export const DRAFT_NOTE =
  "Agents cannot see this until you tap Save as a rule. Not now deletes it. If you leave without choosing, it is deleted after about half an hour.";
export const OLD_PROPOSALS_HEADING = "Suggested rules waiting for your Save";
export const OLD_PROPOSALS_NOTE =
  "These were drafted before drafts were shown right after a thumbs-down, or an agent passed on a correction you gave it. Agents cannot see them until you tap Save as a rule. Not now deletes one. Nothing new is added here after a thumbs-down any more.";
export const RULES_INTRO =
  "A rule is advice you have approved for how your agents should act for you. Agents can read your rules when they ask, but nothing forces an agent to follow one, and we cannot see whether it did. A rule becomes visible to your agents only when you tap Save as a rule; one you have not saved is never shown to any agent.";

export const SAVED_AS_RULE_BANNER = "Saved as a rule. Agents that ask will see it.";
export const SAVED_AS_RULE_AND_LOCKED_BANNER = "Saved as a rule and locked. Agents that ask will see it.";

// ---- Terms and Privacy Notice (run 10) ----
// Plain wording about what Rare Tomato does today. It says nothing about who wrote it or how it was reviewed, and it makes no claim of meeting
// any particular law. What we have not confirmed with a provider is said plainly where it comes up.

/** Bump this when the Terms change in a way people must accept again. Recorded on the account with the time. */
export const TERMS_VERSION = "2026-10-03-2";
export const TERMS_EFFECTIVE_DATE = "2026-10-03";

export const ACCEPT_LABEL = "I am 18 or older and agree to the Terms";
export const PRIVACY_NOTICE_NOTICE = "Read how Rare Tomato handles your information in the Privacy Notice.";

export const OPERATOR_LINE = "Operator: Rare Tomato, Cleveland, Ohio, USA.";
export const CONTACT_LINE = "Privacy, support and requests: support@raretomato.ai.";

/** Who produces a comparison or score. The agent reports what it did; Rare Tomato's own check does the comparing. */
export const SCORE_ORIGIN =
  "Comparisons and scores come from Rare Tomato's own check, which is best-effort and can be wrong. The check uses what the agent reported; the agent does not produce the score.";

export const OTHER_PEOPLE_STATEMENT = "Only add details about someone else if you have their permission or the legal authority to share it.";

export const PROVIDED_AS_IS = "Rare Tomato is a personal project, open source and provided as is.";
export const ADULTS_WORLDWIDE = "Rare Tomato is for adults who are 18 or older, anywhere in the world.";
export const RUNS_IN_US = "Rare Tomato runs in the United States. If you use it from elsewhere, your information is processed and stored in the United States.";

export const COOKIE_ROWS: { name: string; what: string; lasts: string; needed: string }[] = [
  { name: "wos-session", what: "Keeps you signed in.", lasts: "Up to 30 days", needed: "Essential" },
  { name: "wos-auth-verifier", what: "Holds the sign-in step while you sign in.", lasts: "10 minutes", needed: "Essential" },
  { name: "rt_session_cleared and rt_callback_failed", what: "A marker so you are not sent round in a loop after a sign-in error. Set only after an error.", lasts: "60 seconds", needed: "Essential" },
  { name: "rt-install-card-dismissed (browser local storage)", what: "Remembers that you dismissed the install card.", lasts: "Until you clear your browser's site data", needed: "Not essential" },
];
export const COOKIES_PUBLIC = "Our public pages set no cookies and load no third-party scripts, analytics or advertising.";
export const COOKIES_WORKOS = "While you sign in, WorkOS (our sign-in provider) and its provider Cloudflare set their own cookies (such as __cf_bm and _cfuvid) on their pages. We do not control them.";

export const SENSITIVE_READERS_NOTE = "A Sensitive detail starts limited to agents you choose, with none chosen, so no agent can read it until you tick one on its card.";

// ---- Run 10 ----
export const THUMBS_DISCLOSURE = "This sends the task summary, your feedback and your rules in this category to Anthropic to draft a rule.";

/** The confirm card for a health detail (a Sensitive-labeled detail). New ones start limited to agents you choose, with none chosen yet. */
export const SENSITIVE_CARD_HEADING = "Please confirm this health detail";
export const SENSITIVE_CARD_WHAT = "What you are saving:";
export const SENSITIVE_CARD_WHO = "Who can see it: no agent can read it until you choose which agents may, on its card after you save. You choose each one.";
export const SENSITIVE_CARD_CHOICE = "It is your choice to add it, and you can delete it any time. Deleting here does not delete a copy an agent has already kept in its own memory.";
export const SENSITIVE_CONFIRM_LABEL = "I want this health detail saved, with a Sensitive label.";

// ---- UX pass: the feed, the thumbs-down sheet and the screens' own headings (docs/ux/*.md) ----
export const FEED_HEADING = "What your agents did";
export const FEED_SUBLINE = "Agent-reported. Rate what went wrong and we will draft a rule.";
export const THUMBS_UP_LABEL = "Thumbs up";
export const THUMBS_DOWN_LABEL = "Thumbs down";
export const SHEET_TITLE = "What went wrong?";
export const SHEET_SUB = "Pick one. Words are optional.";
export const NOTE_LABEL = "A few words help (optional)";
export const NOTE_PLACEHOLDER = "For example: this was the school office";
export const SEND_LABEL = "Send";
export const SHEET_CLOSE = "Close";
export const YOU_RATED_UP = "You rated this thumbs up. Tap again to change it.";
export const YOU_RATED_DOWN = "You rated this thumbs down. Tap again to change it.";

// ---- Your rules (docs/ux/rules-new-rule.md, docs/ux/rules-saved.md) ----
export const RULES_HEADING = "Your rules";
export const AGENTS_CANNOT_SEE_DRAFT = "Agents cannot see this until you save it.";
export const SEE_TASK_LINK = "See the task it came from";
export const EDIT_THEN_APPROVE = "Edit, then approve";
export const NOT_NOW = "Not now";
export const JUST_SAVED_LABEL = "Just saved";
export const JUST_SAVED_ADVICE = "Agents only read rules when they check; this is advice, not a lock.";
export const savedRulesHeading = (n: number) => `Saved rules (${n})`;
export const visibleTo = (names: string[]) => `Visible to: ${names.length ? names.join(", ") : "no agent right now"}`;
export const justSavedFrom = (agent: string | null, when: string | null) =>
  agent && when ? `From your thumbs down on ${agent}, ${when}.` : agent ? `From your thumbs down on ${agent}.` : "From your own edit or an earlier rule.";
export const NO_SAVED_RULES = "None yet. No agent sees a rule until you save one.";

// ---- Your agents (docs/ux/agents.md) ----
export const AGENTS_HEADING = "Your agents";
export const ONE_STEP_LEFT = "One step left";
export const CONNECTED_LABEL = "Connected";
export const EXPERIMENTAL_LABEL = "Experimental";
export const SETUP_WORKING = "Working";
export const setupWorkingLine = (dateLabel: string, asked: "rules" | "details") => `It asked for your ${asked} on ${dateLabel}. Based on what it told us.`;
export const COPY_THE_LINE = "Copy the line";
export const WHERE_TO_PASTE = "Where do I paste it?";
export const AGENTS_FOOTER = "Rules are advice. Agents only see them when they check, and we only know what they report.";
/** Muse is shown as experimental. Nothing here tells the person to instruct Muse in every chat (owner decision, 2026-10-03). */
export const MUSE_EXPERIMENTAL_LINE = "Muse connects, but it may not check your rules on its own, and its connection may stop after an hour or two.";
export const MUSE_NO_REQUESTS = "We have not seen Muse ask for your rules yet.";
