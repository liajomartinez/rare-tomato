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
export const STARTER_LINE = "At the start of any task you do for me, check my Rare Tomato rules first, then record what you did.";

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
  { name: "rt_picked and rt_later", what: "Remember which agents you picked while setting up, and that you chose Do this later. They hold no personal details.", lasts: "30 days", needed: "Not essential" },
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

export const MORE_FILTERS = "More filters"; // NEW, not in the handoff: the agent and kind-of-task filters the app already had
export const MORE_ON_TASK = "More"; // NEW

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

// ---- The design handoff's strings (design-source/src/strings.js, saved 2026-10-04T02:28Z) ----
// Same keys, same wording, as the handoff. A test (src/lib/design-strings.test.ts) compares this object with design-source/src/strings.js and lists
// every difference on purpose. Differences are marked "OWNER DECISION" below. Screens read these keys; they do not write their own sentences.
// When a new handoff arrives: replace design-source/, read README.md for the version ids, run that test, and update this block.
export const S = {
  product: 'Rare Tomato', // = PRODUCT_NAME
  agentReported: 'Agent-reported', // = AGENT_REPORTED, capitalised as a tag
  nav: { home: 'Home', feed: 'What your agents did', rules: 'Your rules', details: 'Your details', agents: 'Your agents', settings: 'Settings and data', signOut: 'Sign out', menu: 'Menu', close: 'Close', more: 'More' }, // O13
  feed: {
    title: 'What your agents did',
    note: 'Everything here is what your agents told us they did (agent-reported). Anything an agent did not report is not shown, and background work may never be reported.', // = FEED_NOTE
    filterUnreviewed: (n: number) => 'Not reviewed ' + n, // NEW
    filterAll: 'All', // NEW
    pace: "Start with the newest. You don't have to rate every task.", // NEW (review fatigue)
    today: 'Today', yesterday: 'Yesterday', // NEW
    rate: 'Rate this task', up: 'Good', down: 'Not right', // NEW (button labels, no emoji)
    showOlder: (n: number) => 'Show ' + n + ' older', // NEW
    whoTitle: 'Agents logging here', // NEW
    whoNote: 'These agents recorded the tasks in this list.' // NEW (D12 question: see DECISIONS.md)
  },
  sheet: {
    title: 'What went wrong?', // existing design string
    reasonsLabel: 'Reasons', pickOne: 'Pick at least one.', // NEW
    reasons: ["Said something I didn't say", 'Too pushy', 'Shared too much', 'Something else'], // existing design chips
    noteLabel: 'A few words help (optional)', // NEW (problem 2: optional, not required)
    notePlaceholder: 'In your own words', // existing
    noteHint: 'A few words make a better rule. You can skip this.', // NEW
    send: 'Send', // = brief, step 2
    drafting: 'Drafting your rule\u2026', // = DRAFTING_RULE
    draftingNote: 'This can take a few seconds.', // = SPEC (run 7)
    next: 'Next you will see a rule to save or skip. Agents cannot see it until you save it.', // NEW
    close: 'Close'
  },
  rules: {
    title: 'Your rules',
    short: 'Rules are advisory. An agent has to ask for them and can choose not to. What an agent reports about its own work is agent-reported.', // = RULES_SHORT_NOTE
    draftHeading: 'Your new rule (not saved yet)', // = DRAFT_HEADING
    draftNote: 'Agents cannot see this until you tap Save as a rule. If you leave without saving, it is deleted after about half an hour.', // DRAFT_NOTE, reworded: no "Not now" button in UX-1 rev 1
    save: 'Save as a rule', // = SAVE_AS_RULE
    saveLock: 'Save as a rule and lock', // brief + changes.md
    edit: 'Edit, then approve', // brief
    notNow: 'Not now', // brief
    fromHeading: 'Where it came from', // NEW
    fromReason: (agent: string, time: string) => 'Your "Not right" on ' + agent + "'s task, " + time, // NEW
    reasonOnly: 'You added no note, so this was drafted from your reason and the task. Change it if it is not what you meant.', // NEW (D14)
    yourNote: 'Your note', // NEW
    seeSource: 'See the task and feedback it came from', // = run 6
    wouldSee: 'Once saved, these agents can read it when they ask', // NEW
    liveHeading: (n: number) => 'Your live rules \u00B7 ' + n, // NEW
    added: (d: string) => 'Added ' + d, // existing
    locked: 'Locked', // NEW (meaning to confirm: DECISIONS.md)
    editShort: 'Edit', del: 'Delete',
    whoTitle: 'Who can read your rules', // existing
    whoNote: 'Deleting a rule here does not delete a copy an agent has kept in its own memory.', // = AGENT_MEMORY_NOTE, reworded to start at "Deleting a rule"
    savedBanner: 'Saved as a rule. Agents that ask will see it.', // = SAVED_AS_RULE_BANNER
    dismiss: 'Dismiss',
    justSaved: 'Just saved', // NEW
    findIt: 'Find it in the list', // NEW
    readBy: 'Agents that ask can read it' // NEW
  },
  agents: {
    title: 'Your agents',
    intro: 'Each agent here can read your rules when it asks. "Asked" dates come from our own record. They do not mean the agent followed a rule.', // adapted from existing intro (D4)
    waitingHeading: 'New agents waiting for you', // D9
    connectedHeading: 'Your connected agents', // D9
    timedOutHeading: 'Timed out', // D9
    disconnectedHeading: 'Disconnected', // D9
    newEyebrow: 'New agent waiting',
    looksLike: (p: string) => 'Looks like ' + p,
    newBody: 'It signed in, but you have not confirmed it yet. Until you do, it can only say hello. It cannot see any of your details.', // adapted from existing
    expiry: (when: string, days: number) => 'An agent you do not confirm stops working after ' + days + ' days. For this one that is ' + when + '.', // = unconfirmedAgentNote
    check: 'Check who it is', // D9
    statusNot: 'Set up: not finished', // = SETUP_NOT_FINISHED
    statusNotHelp: 'We have not seen it ask for your rules or details yet.', // = SETUP_NOT_FINISHED_HELP
    statusWorking: (d: string) => 'Working: it asked for your rules on ' + d, // = setupWorking
    nextStep: 'Next step', // NEW
    nothingToDo: 'Nothing to do. Look in now and then.', // NEW
    showSteps: 'Show the steps', hideSteps: 'Hide the steps', // NEW
    details: 'Setup details', // NEW
    openAria: (n: number) => 'Open ' + n,
    timedOutBody: 'An agent that signed in as Grok Bot was not confirmed in time, so it was turned off.', // adapted
    connectAgain: 'Connect it again', remove: 'Remove from this list',
    disconnectedBody: "Old Marge is disconnected and can't get anything.", // adapted
    disconnectedNote: 'Deleting or disconnecting does not delete a copy an agent has kept in its own memory.', // = AGENT_MEMORY_NOTE, reworded for this screen (D12)
    connect: 'Connect an agent',
    seeTitle: 'What we can and cannot see', // NEW
    see: ['Only requests that reach our server show up here. We cannot see inside the agent, so we cannot tell whether you pasted the line.', // = STARTER_LIMITS[1]
      'Advice, not enforcement: even with the line, an agent can skip it, and we cannot see whether it followed a rule it read.'], // = STARTER_LIMITS[0]
    whoTitle: 'Who can read your rules', whoNote: 'Open an agent to change what it can read.' // NEW
  },
  starter: {
    heading: 'Add the starter line',
    stepCopy: 'Copy the line', // NEW
    line: 'At the start of any task you do for me, check my Rare Tomato rules first, then record what you did.', // replaces STARTER_LINE (O7); see UX-1 rev 6
    stepPaste: (where: string) => 'Paste it at the end of ' + where + '. Do not replace what is already there.', // NEW
    stepCheck: 'Start a new chat and ask for a small task. This card changes when we see the agent ask for your rules.', // NEW
    checkQ: 'Make me a short packing list for a weekend away.', // NEW sample task
    good: 'Still "not finished"? The line may not have saved, or the agent may need a new chat.', // NEW
    whyLink: 'Why we suggest this', // NEW
    why: 'Agents only look at your rules when they are told to. In our small test (six tasks each for Claude and ChatGPT, so it points a direction and proves nothing), both asked for the rules and details on every task when this line was in their own instructions, and asked on none in our earlier tests without it (those ran at other times, so the comparison is rough).', // = STARTER_WHY
    claudeWhere: 'your Claude profile preferences', // data.js (O11)
    limit: 'It only looks at your rules when told to, so we suggest the line. Rules are advice.', // NEW (short)
    pasteNote: 'You paste it there. Rare Tomato cannot do that for you.' // = STARTER_LIMITS[2], shortened
  },
  muse: {
    // OWNER DECISION 2026-10-03: Muse is experimental and nobody is told to instruct it in every chat. The handoff's chatSentence, step1, next and copy keys are not used.
    line: MUSE_EXPERIMENTAL_LINE, // = the owner's line
    experimental: 'Experimental', // = the owner's label
    limit: 'In our tests Muse stopped working after about an hour or two. If that happens, reconnect it.', // adapted from MUSE_LIMIT
    reconnectHeading: 'If Pip stops working', // NEW
    reconnect: ['In Muse, open Settings, then Connectors, then Rare Tomato, then Disconnect.', 'In a chat, ask Muse to set up the connector again, then choose Connect.', 'Approve on the sign-in page.', 'Confirm it on Your agents with "This replaces my old Muse".'], // = MUSE_LIMIT, split into steps
    unknown: 'We do not yet know why it stops.', // = MUSE_LIMIT
    factsLink: 'What we saw in our tests', // NEW
    facts: "In our tests (one run each, 2026-10-03), the standing line did not make Muse check on its own: with it in SOUL.md and a normal task, no request from Muse arrived, and with it in Muse's Memory and a normal task, none arrived. This is a small test, not a promise.", // OWNER DECISION: the handoff's text goes on to say Muse did check when told in the chat, and to tell people to do that each time; both sentences are left out.
    reconnectLink: 'Reconnect steps'
  },
  home: {
    hello: 'Hello again',
    waitTitle: (n: number) => n + ' new ' + (n === 1 ? 'agent is' : 'agents are') + ' waiting for you.', // D9
    waitBody: (n: number) => 'Until you confirm it, it can only say hello. ' + n + (n === 1 ? ' agent needs' : ' agents need') + ' one more step.', // D9 + agentsNeedStep
    reviewSticker: (n: number) => n + ' to review', // existing
    reviewNewest: 'Newest', // NEW
    review: 'Review now', // NEW
    reviewAll: (n: number) => 'See all ' + n, // NEW
    reviewPace: "Newest first. You don't have to rate every task.", // NEW
    nothing: "Nothing to review right now. Look in now and then. Scores are each agent's own account.", // existing
    installTitle: 'Add Rare Tomato to your home screen', // NEW
    installBody: 'It opens in its own window, like an app. Nothing else changes.', // NEW
    installShow: 'Show me how', installLater: 'Not now', // NEW
    whoTitle: 'Who can read your rules'
  },
  coverage: (n: number) => n + ' tasks logged. Anything your agents did not log is not visible here.', // = coverageNote
  // First login and onboarding (UX-1 rev 2). All NEW unless marked.
  onb: {
    stepOf: (n: number) => 'Step ' + n + ' of 3',
    back: 'Back',
    landing: {
      headline: 'Set your rules once. Every agent can read them.',
      sub: 'One shared memory for the agents you use. See what each one says it did, and fix it in a few taps.',
      start: 'Get started', signIn: 'I already have an account',
      points: [['Set rules once', 'Write them in one place. Each agent you connect can read them.'], ['Review what they did', 'See what each agent says it did, and rate it.'], ['Fix it in a few taps', 'Correct a mistake and save it as a rule.']],
      exampleRule: 'Ask before sharing my phone number or address.', exampleNote: 'One rule, readable by both.',
      limits: 'Rules are advice. An agent has to ask for them and can choose not to. What an agent reports about its own work is agent-reported.' // adapted RULES_SHORT_NOTE
    },
    signup: {
      title: 'Create your account', body: 'You will sign in with email or Google on the next page.', // BUILD NOTE: handoff says "We'll email you a link to sign in." The hosted sign-in page decides the method (open item O9), so the sentence was changed.
      // BUILD NOTE: the handoff's email field and placeholder are not used; the hosted sign-in page asks for the email.
      adult: 'I am 18 or older.', adultNote: 'Rare Tomato is for adults. We only ask once.', // adapted from D8
      send: 'Continue', have: 'Already have an account?', signIn: 'Sign in' // BUILD NOTE: handoff says send: "Email me a link" (see body)
    },
    pick: {
      title: 'Which agents do you use?', body: 'Pick the ones you want to connect first. You can add more later.',
      options: ['Claude', 'ChatGPT', 'Grok Bot', 'Muse'], // D5 names
      next: 'Continue', need: 'Pick at least one to continue.'
    },
    connect: {
      agentOf: (n: number, m: number) => 'Agent ' + n + ' of ' + m, stepOf: (n: number, m: number) => 'Step ' + n + ' of ' + m,
      s1: { title: (a: string) => 'Open ' + a, body: (a: string) => 'We open ' + a + ' with Rare Tomato already filled in. Nothing is added until you tap Add.', button: (a: string) => 'Open ' + a, copyInstead: 'Copy the address instead', address: 'https://rare-tomato.example/connect', copy: 'Copy address', copied: 'Copied' },
      s2: { title: 'Tap Add, then sign in', body: (a: string) => 'In ' + a + ', tap Add. Then tap Connect and sign in with the account you use here.', button: "I've signed in" },
      s3: { title: (a: string) => 'Looking for ' + a, body: 'This can take a moment. Nothing is shared until you confirm it.', status: (a: string) => 'Waiting for ' + a + '.', check: 'Check again', notShowing: 'Not showing up? Send a test message' },
      s4: { title: 'Send a test message', body: (a: string) => 'This tells Rare Tomato which agent is yours. It opens ' + a + ' with the message ready. Send it, then come back.', message: 'Use the Rare Tomato hello tool.', button: (a: string) => 'Open ' + a + ' with the message', copyInstead: 'Copy the message instead' },
      later: 'Do this later', back: 'Back', then: (a: string) => 'Then: ' + a
    },
    arrived: {
      title: (a: string) => a + ' is connected.', body: 'Confirm it is yours. Until you do, it cannot see any of your details.',
      nameLabel: 'What do you call it?', nameHint: 'We use this name everywhere.', name: 'Marge',
      confirm: 'Yes, this is my agent', notMine: 'This is not mine'
    },
    setup: {
      why: 'Until you do this, your agent ignores every rule you save, and nothing will show an error.',
      whyMore: 'Connecting only lets an agent call Rare Tomato. It calls it only if its own instructions tell it to. We cannot reach inside another company\'s agent, so you do this once, by hand, for each agent.',
      title: (a: string) => 'Tell ' + a + ' to check your rules', museTitle: 'Muse is experimental', // NEW (owner decision: no every-chat step for Muse)
      line: 'At the start of any task you do for me, check my Rare Tomato rules first, then record what you did.',
      copy: 'Copy the line', copied: 'Copied', pasted: "I've pasted it", openSettings: (a: string) => 'Open ' + a + ' settings',
      addEnd: 'Add it to the end of anything already there. Do not replace your existing instructions.',
      evidence: 'In our small test, Claude and ChatGPT checked the rules on 6 of 6 tasks with this line in their own instructions, and on none without it. That points a direction and proves nothing.',
      required: 'Required', optional: 'Optional', experimental: 'Experimental',
      lastChecked: (d: string) => 'Menu names last checked ' + d, checkedOn: '3 Oct 2026',
      fallback: (a: string) => 'Can\'t find it? Open ' + a + "'s settings and look for custom instructions or personal preferences.",
      guides: { // data: menus change often (O11)
        'Claude': { kind: 'required', steps: ["Open Claude's settings.", 'Find the personal preferences box.', 'Paste the line at the end.', 'Save.'] },
        'ChatGPT': { kind: 'required', steps: ["Open ChatGPT's settings.", 'Go to Personalization, then Custom instructions.', 'Paste the line at the end.', 'Save.'] },
        'Grok Bot': { kind: 'optional', intro: 'In our tests Grok Bot checked your rules on its own, so you can usually skip this. It runs in the desktop app only.', steps: [] },
        'Muse': { kind: 'experimental', intro: MUSE_EXPERIMENTAL_LINE, steps: [] } // OWNER DECISION: handoff says paste each time; not used
      },
      skipOptional: 'Continue', showWhere: 'Show me where', hideWhere: 'Hide',
      try: { title: (a: string) => 'Try it with ' + a, body: (a: string) => 'Start a new chat and ask ' + a + ' for a small task, like a short list.', check: 'Check again', helpHeading: 'Still not finished?', help: ['The line may not have saved. Open the settings again and check it is there.', 'The agent may need a new chat.', 'Its custom instructions may be switched off.'], honest: 'We can only see what the agent does, so we cannot tell you whether the line was saved.', working: (d: string) => 'Working: it asked for your rules on ' + d, last: 'Last step' },
      stopped: { title: (a: string) => a + ' stopped working', body: 'In our tests, Muse connections stopped after about one to two hours (74, 93 and 107 minutes). We do not yet know why.', button: (a: string) => 'Reconnect ' + a, steps: ['In Muse, open Settings, then Connectors, then Rare Tomato, then Disconnect.', 'In a chat, ask Muse to set up the connector again, then choose Connect.', 'Approve on the sign-in page.', 'Confirm it on Your agents with "This replaces my old Muse".'] }
    },
    dash: {
      title: 'Home',
      connectedHeading: 'Your agents', waitingTask: 'Connected. Waiting for its first task.',
      nextEyebrow: 'Next step', nextTitle: 'Write your first rule', nextBody: 'All agents read these rules before acting.', nextButton: 'Write a rule',
      reviewHeading: 'To review', reviewEmpty: (a: string) => 'Nothing yet. When ' + a + ' logs a task, it shows up here.',
      scoreHeading: 'Score', scoreLearning: 'Still learning', scoreNote: '0 tasks logged. We need 5 before showing a score. Agent-reported.', // adapted from ScoreCard
      install: 'Add Rare Tomato to your home screen',
      none: { title: (a: string) => 'Connect ' + a, body: 'Rare Tomato needs one agent connected to start working.', button: (a: string) => 'Connect ' + a, status: 'Not connected yet', noReaders: 'No agent can read your rules yet.' }
    }
  }
};
