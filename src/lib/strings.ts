// The one place for the user-facing sentences that appear on more than one screen (honest limits, labels, notes).
// Screens import these instead of writing their own, so a wording change is a one-line change and a copy test can check them all.
//
// House rules (CLAUDE.md, SPEC 6.7, 9.3): MCP is pull and rules are advice, so never say a rule is enforced or followed; scores are
// agent-reported, never verified or independent; the blocked-data check is best-effort, never a guarantee. No pet, tamagotchi,
// livestock or "wrangling" words. The words for turning a correction into a rule ("Draft a rule", "Proposed rule", "Save rule", "Discard") are the
// handoff's (owner decision 5, 2026-10-04); the score-band words (O2) are Lia's, 2026-10-03. Still open: the name "Care sheet" (O6), so it lives in ONE
// constant below and nothing else spells it out.

export const PRODUCT_NAME = "Rare Tomato";

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
  "The details you save are stored encrypted, but our servers can decrypt them in order to pass them to your agents. This is not end-to-end encryption.";

export const SCORE_PAUSED = "Scoring is paused for now. Your feedback is still saved.";

/** The word a person types to confirm deleting their account (Settings and data). */
export const DELETE_PHRASE = "DELETE";

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

export const DRAFT_FAILED = "We could not draft a rule. Add a few words and tap Not right again.";
export const DRAFT_GONE = "That draft is not here any more. Tap Not right again if you still want a rule.";
export const NOT_NOW_BANNER = "Not saved. Nothing was added to your rules.";
export const OLD_PROPOSALS_HEADING = "Suggested rules waiting for your Save";
export const OLD_PROPOSALS_NOTE =
  "These were drafted before drafts were shown right after Not right, or an agent passed on a correction you gave it. Agents cannot see them until you choose Save rule. Discard deletes one. Nothing new is added here after Not right any more.";
/** Same words as S.rules.savedBanner (the handoff). */
export const SAVED_AS_RULE_BANNER = "Rule saved. Your connected agents can read it.";

// ---- Terms and Privacy Notice (run 10) ----
// Plain wording about what Rare Tomato does today. It says nothing about who wrote it or how it was reviewed, and it makes no claim of meeting
// any particular law. What we have not confirmed with a provider is said plainly where it comes up.

/** Bump this when the Terms change in a way people must accept again. Recorded on the account with the time. */
export const TERMS_VERSION = "2026-10-03-2";
export const TERMS_EFFECTIVE_DATE = "2026-10-03";

/** The one box (owner decision 6, 2026-10-04), on Create your account and, for anyone who signed in without it, on /welcome. "Terms" and "Privacy Notice" are links. */
export const ACCEPT_LABEL = "I am 18 or older and agree to the Terms and Privacy Notice.";

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
  { name: "rt_terms", what: "Remembers, for up to an hour, that you ticked the box to accept the Terms and Privacy Notice, so it can be recorded on your account when you finish signing in. It holds no personal details.", lasts: "1 hour", needed: "Essential" },
  { name: "rt_picked and rt_later", what: "Remember which agents you picked while setting up, and that you chose Do this later. They hold no personal details.", lasts: "30 days", needed: "Not essential" },
  { name: "rt-install-card-dismissed (browser local storage)", what: "Remembers that you dismissed the install card.", lasts: "Until you clear your browser's site data", needed: "Not essential" },
];
export const COOKIES_PUBLIC = "Our public pages set no cookies and load no third-party scripts, analytics or advertising.";
export const COOKIES_WORKOS = "While you sign in, WorkOS (our sign-in provider) and its provider Cloudflare set their own cookies (such as __cf_bm and _cfuvid) on their pages. We do not control them.";

export const SENSITIVE_READERS_NOTE = "A Sensitive detail starts limited to agents you choose, with none chosen, so no agent can read it until you tick one on its card.";

/** The confirm card for a health detail (a Sensitive-labeled detail). New ones start limited to agents you choose, with none chosen yet. */
export const SENSITIVE_CARD_HEADING = "Please confirm this health detail";
export const SENSITIVE_CARD_WHAT = "What you are saving:";
export const SENSITIVE_CARD_WHO = "Who can see it: no agent can read it until you choose which agents may, on its card after you save. You choose each one.";
export const SENSITIVE_CARD_CHOICE = "It is your choice to add it, and you can delete it any time. Deleting here does not delete a copy an agent has already kept in its own memory.";
export const SENSITIVE_CONFIRM_LABEL = "I want this health detail saved, with a Sensitive label.";

export const MORE_FILTERS = "More filters"; // NEW, not in the handoff: the agent and kind-of-task filters the app already had
export const MORE_ON_TASK = "More"; // NEW

/** The label on the edit form of a saved or proposed rule (the handoff shows an Edit button; the edit screen itself is not designed). */
export const EDIT_THEN_APPROVE = "Edit rule";

// ---- The design handoff's strings (design-source/copy/strings.js, UX-1 revision 8, 2026-10-04) ----
// Same keys, same wording, as the handoff. A test (src/lib/design-strings.test.ts) compares this object with design-source/copy/strings.js and lists
// every difference on purpose (there are none today: the owner's decisions of 2026-10-04 are constants outside S). Screens read these keys; they do not write their own sentences.
// When a new handoff arrives: replace design-source/, read README.md for the version ids, run that test, and update this block.

/** The one connector address (owner decision, 2026-10-04): https://raretomato.ai/mcp everywhere. */
export const MCP_URL = "https://raretomato.ai/mcp";

/**
 * The standing instruction (owner decision, 2026-10-04): the one sentence everywhere the product tells a person to add an instruction (Claude's
 * preferences, ChatGPT's custom instructions, the Muse setup message). Word for word. Change it here and nowhere else.
 */
export const AGENT_INSTRUCTION =
  "At the start of any task you do for me, including drafts, plans and lists, check my Rare Tomato rules (get_rules) and saved details (get_care_profile) first, then record what you did with log_task.";

/** Grok Bot gets the one-line connect message only, with no instruction. */
export const GROK_MESSAGE = `Connect this MCP server for me: ${MCP_URL}`;
/** Muse gets the connect message, then the instruction. Word for word. */
export const MUSE_MESSAGE = `Connect this MCP server for me: ${MCP_URL}. ${AGENT_INSTRUCTION}`;

export const S = {
  product: 'Rare Tomato',
  agentReported: 'Agent-reported',
  nav: { home: 'Home', feed: 'Agent Activity', rules: 'Your Rules', agents: 'Connected Agents', settings: 'Settings and data', signOut: 'Sign out', menu: 'Menu', close: 'Close', more: 'More' },
  feed: {
    title: 'Agent Activity',
    intro: 'Recent tasks your agents reported to Rare Tomato.',
    about: 'About this list',
    aboutNote: 'Rare Tomato only shows tasks an agent reports. Unreported activity is not visible here.',
    filterToReview: (n: number) => 'To review \u00B7 ' + n,
    filterAll: 'All',
    pace: 'Newest first. Review only what you want.',
    today: 'Today', yesterday: 'Yesterday',
    up: 'Good', down: 'Not right',
    showOlder: (n: number) => 'Show ' + n + ' older'
  },
  sheet: {
    title: 'What went wrong?',
    reasonsLabel: 'Reasons', pickOne: 'Pick at least one.',
    reasons: ["Said something I didn't say", 'Too pushy', 'Shared too much', 'Something else'],
    noteLabel: 'Add a note (optional)',
    notePlaceholder: 'What should it have done instead?',
    cta: 'Draft a rule',
    ai: "Your feedback is sent to Anthropic's AI to draft the rule.",
    helper: "You'll review the rule before it is saved.",
    drafting: 'Turning your feedback into a rule\u2026',
    draftingNote: 'This usually takes a few seconds.',
    close: 'Close'
  },
  rules: {
    title: 'Your Rules and Info',
    subtext: 'This is the information your agents check before they work for you.',
    partRules: 'Rules', partInfo: 'Info',
    short: 'Rules are advisory. An agent has to ask for them and can choose not to. What an agent reports about its own work is agent-reported.',
    eyebrow: 'Proposed rule', notSaved: 'Not saved yet',
    source: (agent: string) => 'Created from your feedback on ' + agent + "'s task.",
    seeSource: 'See original task and feedback',
    scope: 'Who can use this rule?',
    save: 'Save rule', discard: 'Discard',
    liveHeading: (n: number) => 'Your Rules \u00B7 ' + n,
    added: (d: string) => 'Added ' + d,
    editShort: 'Edit', del: 'Delete',
    whoTitle: 'Who can read your rules',
    delNote: "Deleting a rule won't remove copies an agent already saved.",
    savedBanner: 'Rule saved. Your connected agents can read it.',
    dismiss: 'Dismiss',
    justSaved: 'Just saved',
    findIt: 'Find it in the list',
    availableTo: 'Available to'
  },
  agents: {
    title: 'Connected Agents',
    intro: 'Dates come from our own record. They do not mean an agent followed a rule.',
    attention: 'Needs attention', connected: 'Connected', removed: 'Removed', expired: 'Expired',
    needsConfirm: 'Needs confirmation', confirm: (n: string) => 'Confirm ' + n,
    finishSetup: 'Finish setup',
    museBody: "Muse is connected, but it hasn't checked Rare Tomato yet.",
    timedOut: 'Connection timed out', reconnect: 'Reconnect',
    working: 'Working', lastChecked: (d: string) => 'Last checked your rules ' + d + '.',
    setupNot: 'Setup not finished', claudeBody: 'Add one instruction so Claude knows when to check Rare Tomato.',
    experimental: 'Experimental',
    remove: 'Remove',
    removeNote: "Removing an agent won't remove copies it already saved.",
    connect: 'Connect an agent',
    seeTitle: 'What we can and cannot see',
    see: ['Only tasks that reach Rare Tomato show up here. We cannot see inside an agent.', 'Rules are advice. An agent can choose not to follow one, and we cannot see whether it did.'],
    whoTitle: 'Who can read your rules', whoNote: 'Open an agent to change what it can read.',
    waitingTitle: (n: string) => n + ' is waiting to connect',
    waitingBody: 'It signed in successfully. Confirm it to finish connecting.',
    waitingData: 'It cannot use your Rare Tomato rules until you confirm the connection.',
    expiry: (when: string, days: number) => 'An agent you do not confirm stops working after ' + days + ' days. For this one that is ' + when + '.',
    // focused finish-setup screens
    finishTitle: (n: string) => 'Finish setting up ' + n,
    museStep: 'Paste this into a Muse chat.',
    museNote: 'Our connection to Muse is experimental. It may need reconnecting after an hour or two.',
    prompt: 'Check my Rare Tomato rules now and use any that apply.',
    copyPrompt: 'Copy prompt', openMuse: 'Open Muse', back: 'Back'
  },
  home: {
    welcome: 'Welcome back',
    attnTitle: (n: number) => n + ' things need your attention',
    attnBody: 'Confirm one agent and finish setting up another.',
    reviewSetup: 'Review setup',
    reviewSticker: (n: number) => n + ' to review',
    reviewNewest: 'Newest',
    review: 'Review',
    reviewAll: (n: number) => 'See all ' + n,
    installTitle: 'Add Rare Tomato to your home screen',
    installBody: 'It opens in its own window, like an app. Nothing else changes.',
    installShow: 'Show me how', installLater: 'Not now',
    whoTitle: 'Who can read your rules',
    ask: (agent: string) => 'Ask ' + agent + ' to help with something.'
  },
  score: {
    title: (n: string) => n + "'s rule following",
    based: (n: number) => 'Based on ' + n + ' reported tasks.',
    cta: 'Review recent tasks',
    how: 'How scoring works',
    howNote: 'Rare Tomato can only score tasks the agent reports. Unreported activity is not visible.',
    learning: 'Still learning',
    need: (n: number) => n + ' reported tasks so far. We need 5 before showing a score.'
  },
  onb: {
    stepOf: (n: number, m?: number) => 'Step ' + n + ' of ' + (m || 3),
    back: 'Back', later: 'Do this later',
    landing: {
      headline: 'Teach your AI agents to work your way.',
      sub: 'Set your preferences once across the agents you use, then improve how they follow them with a few taps after each task.',
      start: 'Get started', signIn: 'I already have an account',
      example: 'Example rule',
      exampleRule: 'Ask before sharing my phone number or address.',
      chips: ['Claude', 'ChatGPT', 'Grok Bot', 'Muse'],
      points: [['Set your preferences once', 'Add the rules and preferences you want your agents to know.'], ['Review Agent Activity', 'See the tasks your Connected Agents report and how they scored themselves.'], ['Correct them in a few taps', 'Give feedback and turn mistakes into new rules for next time.']],
      limitsLead: 'Rare Tomato does not control your agents.',
      limits: ' Agents choose when to read and follow your rules. Task history and adherence scores are based on what each agent reports.',
      privacy: 'Privacy', terms: 'Terms'
    },
    signup: {
      title: 'Create your account', body: "We'll email you a link to sign in.",
      email: 'Your email', emailPh: 'you@example.com',
      agree: ['I am 18 or older and agree to the ', ' and ', '.'], terms: 'Terms', privacy: 'Privacy Notice',
      send: 'Email me a link', have: 'Already have an account?', signIn: 'Sign in'
    },
    pick: {
      title: 'Which agent do you want to connect first?', body: 'You can add the others later.',
      options: ['Claude', 'ChatGPT', 'Grok Bot', 'Muse'], experimental: 'Experimental',
      next: 'Continue', need: 'Pick one to continue.'
    },
    setup: {
      openAgent: (a: string) => 'Open ' + a,
      showWhere: 'Show me where', hideWhere: 'Hide',
      copy: 'Copy', copied: 'Copied', copyUrl: 'Copy URL',
      done: 'I connected Rare Tomato', added: 'I added it',
      claude: {
        connect: { title: 'Connect Rare Tomato to Claude', body: 'Claude needs access to Rare Tomato before it can check your rules.', primary: 'Open Claude connectors', nameLabel: 'Name', name: 'Rare Tomato', urlLabel: 'Connector URL',
          steps: ['Choose Add custom connector.', 'Name it Rare Tomato.', 'Paste ' + MCP_URL + '.', 'Continue and sign in to Rare Tomato when Claude asks.'],
          fallback: 'Customize \u2192 Connectors \u2192 Add custom connector' },
        instr: { open: 'Open Claude instructions', where: ["Open Claude's settings.", 'Find the personal preferences box.', 'Add the instruction at the end.', 'Save.'] }
      },
      chatgpt: {
        connect: { title: 'Connect Rare Tomato to ChatGPT', body: 'ChatGPT needs access to Rare Tomato before it can check your rules.', primary: 'Open ChatGPT app settings', urlLabel: 'MCP URL',
          steps: ['Turn on Developer mode if ChatGPT asks.', 'Choose Create app.', 'Paste ' + MCP_URL + '.', 'Scan the tools.', 'Sign in to Rare Tomato when ChatGPT asks.', 'Finish creating the app.'],
          fallback: 'Settings \u2192 Apps \u2192 Create', fallback2: 'If needed first: Settings \u2192 Apps \u2192 Advanced settings \u2192 Developer mode' },
        instr: { open: 'Open Custom Instructions', where: ["Open ChatGPT's settings.", 'Go to Personalization, then Custom Instructions.', 'Add the instruction at the end.', 'Save.'] }
      },
      instr: {
        title: (a: string) => 'Tell ' + a + ' to check Rare Tomato',
        body: (a: string) => 'Add this once so ' + a + ' knows to check your rules before it works for you.',
        copy: 'Copy instruction',
        guidance: 'Add it to your existing instructions. Do not replace anything already there.'
      },
      verify: {
        title: 'Make sure it works',
        body: (a: string) => 'Run one quick test in ' + a + '. Rare Tomato will confirm when ' + a + ' checks your rules and reports the task.',
        open: (a: string) => 'Open ' + a,
        checkedRules: 'Checked your rules', reportedTask: 'Reported the test task', waiting: 'Waiting',
        ready: (a: string) => a + ' is ready',
        readyBody: 'Rare Tomato saw it check your rules and report the test task.',
        partial: (a: string) => a + ' can read your rules, but it did not report the test task.',
        partialPrompt: 'Now report what you did to Rare Tomato.',
        tryAgain: 'Try again', trouble: 'Troubleshooting',
        troubleList: ['Open the instructions again and check the text is saved.', 'Start a new chat and run the test again.', 'Make sure custom instructions are switched on.'],
        another: 'Connect another agent', continue: 'Continue to Rare Tomato'
      },
      grok: {
        title: 'Connect Rare Tomato to Grok Bot',
        body: 'Paste this into a new Grok Bot chat. Grok Bot will set up Rare Tomato and ask you to sign in.',
        msg: GROK_MESSAGE,
        copy: 'Copy setup message', open: 'Open Grok Bot',
        note: 'After you sign in, Rare Tomato looks for a real call from Grok Bot.',
        ready: 'Grok Bot is ready', readyBody: 'Rare Tomato saw Grok Bot check your rules.',
        anotherWay: 'Connect another way', failTitle: 'Connect another way',
        failBody: 'Open Grok Bot connectors and add Rare Tomato with this URL.', failOpen: 'Open Grok Bot connectors', failUrl: 'https://grok.com/connectors', failUrlLabel: 'MCP URL'
      },
      muse: {
        title: 'Connect Rare Tomato to Muse',
        body: 'Paste this into a new Muse chat. Muse will set up Rare Tomato and ask you to sign in.',
        msg: MUSE_MESSAGE,
        copy: 'Copy setup message', open: 'Open Muse',
        notice: 'Our connection to Muse is experimental. It may need reconnecting after an hour or two. If that happens, reconnect the same way.',
        ready: 'Muse is connected', readyBody: 'It may need reconnecting after an hour or two.'
      }
    },
    dash: {
      title: 'Home',
      connectedHeading: 'Connected Agents', waitingTask: 'Connected. Waiting for its first task.',
      nextEyebrow: 'Next step', nextTitle: 'Write your first rule', nextBody: 'Agents can read these rules when they ask.', nextButton: 'Write a rule',
      reviewHeading: 'To review', reviewEmpty: (a: string) => 'Nothing yet. When ' + a + ' reports a task, it shows up here.',
      scoreHeading: 'Rule following',
      install: 'Add Rare Tomato to your home screen',
      none: { title: (a: string) => 'Connect ' + a, body: 'Rare Tomato needs one agent connected to start working.', button: (a: string) => 'Connect ' + a, status: 'Not connected yet', noReaders: 'No agent can read your rules yet.' }
    }
  }
};

// Where each "Open ___" button goes: see src/lib/agent-links.ts.

// ---- Sentences the handoff leaves as one fixed sample but the product says for any number or any agent (NEW, built from the handoff's words) ----

/** "1 thing needs your attention" (the handoff only shows the plural). */
export const attentionTitle = (n: number) => (n === 1 ? '1 thing needs your attention' : S.home.attnTitle(n));

/** The line under the attention title. For one agent to confirm and one to finish it is exactly the handoff's sentence. */
export function attentionBody(confirm: number, finish: number, timedOut: number): string {
  if (confirm === 1 && finish === 1 && timedOut === 0) return S.home.attnBody;
  const count = (n: number) => (n === 1 ? 'one agent' : n + ' agents');
  const parts: string[] = [];
  if (confirm > 0) parts.push('confirm ' + count(confirm));
  if (finish > 0) parts.push('finish setting up ' + count(finish));
  if (timedOut > 0) parts.push('reconnect ' + count(timedOut));
  const text = parts.length <= 1 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
  return text ? text.charAt(0).toUpperCase() + text.slice(1) + '.' : '';
}

/** Needs-attention sentence for a connected agent that has not checked Rare Tomato yet. Claude's is the handoff's sentence word for word. */
export const finishBody = (platform: string, name: string) =>
  platform === 'Claude' ? S.agents.claudeBody : 'Add one instruction so ' + name + ' knows when to check Rare Tomato.';
export const messageBody = (name: string) => (name === 'Muse' ? S.agents.museBody : name + " is connected, but it hasn't checked Rare Tomato yet.");
/** Muse's wording for an expired connection (Lia, round 9). */
export const MUSE_EXPIRED_BODY = 'Our connection to Muse is experimental. It may need reconnecting after an hour or two. You can reconnect the same way.';
export const TIMED_OUT_BODY = 'It signed in, but was not confirmed in time, so it was turned off.';
export const reconnectNote = (name: string) => name + ' signed in again? Choose "This replaces my old ' + name + '" when you confirm it.';
export const NO_CALLS_YET = 'Connected. Waiting for its first task.';
export const NEEDS_CONFIRMATION_AGENT = 'New agent';

/**
 * The sign-up button. The handoff says "Email me a link" and shows an email field, but Rare Tomato has no email form of its own: the hosted sign-in page
 * asks for the email and decides how the person signs in (open item O9). So the button says what it does. It is off until the box is ticked, as designed.
 */
export const SIGN_UP_CONTINUE = 'Continue';
/** The sentence under the title on Create your account. The handoff promises an emailed link; the hosted sign-in page decides (O9). */
export const SIGN_UP_BODY = 'You will sign in with email or Google on the next page.';

// ---- Where each step can be done (owner decision 11, 2026-10-04; NEW wording, not in the handoff) ----
/** ChatGPT: the instruction is added on the website. */
export const CHATGPT_WEBSITE_NOTE = "Add this on the ChatGPT website (chatgpt.com), not in the app.";
/** Muse: the test prompt is run in the desktop app. */
export const MUSE_DESKTOP_NOTE = "Run the test prompt in the Muse desktop app.";
/** Grok Bot runs in the desktop app only (Lia, 2026-10-03). */
export const GROK_DESKTOP_NOTE = "Grok Bot runs in the desktop app only.";
