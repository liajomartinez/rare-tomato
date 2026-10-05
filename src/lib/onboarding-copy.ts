import { AGENT_INSTRUCTION, GROK_MESSAGE, MCP_URL, MUSE_MESSAGE } from "./strings";

// The words of the round 9 onboarding, word for word from the handoff's copy/strings.v9.js and the two copy files Lia supplied
// (rare-tomato-onboarding-copy and rare-tomato-round9-exact-copy, both 2026-10-05). A test (onboarding-copy.test.ts) compares this module with them.
// If a line does not fit a screen, the screen changes, never the words.

export type AgentKey = "claude" | "chatgpt" | "grok" | "muse";
export const AGENT_KEYS: readonly AgentKey[] = ["claude", "chatgpt", "grok", "muse"];
export const NAMES: Record<AgentKey, string> = { claude: "Claude", chatgpt: "ChatGPT", grok: "Grok Bot", muse: "Muse" };

const road: [string, string][] = [
  ["Connect your agent", "Let your agent find your Rare Tomato rules."],
  ["Tell it to use Rare Tomato", "Add one instruction so it checks your rules."],
  ["Write your first rule", "Teach your agent how you like things done."],
];
/** The three rail labels per agent. Grok Bot and Muse have no separate instruction step. */
export const RAILS: Record<AgentKey, [string, string | null][]> = {
  claude: road,
  chatgpt: road,
  grok: [road[0], ["Check it works", null], road[2]],
  muse: [["Connect your agent and give it the instruction (one message)", null], ["Check it works", null], road[2]],
};

export const STATE_WORDS = { done: "Done", now: "Now", next: "Next" } as const;
export const RAIL_LABEL = "Progress";
export const EXPIRED = "Expired";
export const stepLabel = (n: number, title: string) => `Step ${n} of 3 · ${title}`;

export const ROADMAP = { title: "Here's what we'll do", line: "A few minutes in total. You can stop and come back at any time.", start: "Start", later: "Do this later" };
export const PICK = {
  title: "Which agent do you want to set up first?",
  body: "You can add the others later.",
  options: ["Claude", "ChatGPT", "Grok Bot", "Muse"],
  exp: "Experimental",
  museLine: "Our connection is experimental. May need reconnecting after an hour or two.",
  button: "Continue",
  need: "Pick one to continue.",
};
export const UI = { showShot: "Show me what it looks like", showDetails: "Show the details again" };

export const MUSE_NOTICE =
  "Our connection to Muse is experimental. It may need reconnecting after an hour or two. If that happens, reconnect the same way.";
export const MUSE_EXPIRED =
  "Our connection to Muse is experimental. It may need reconnecting after an hour or two. You can reconnect the same way.";

const goBack = (n: string) => `Go back to ${n} to paste`;
const chat = (n: string) => [`Tap Start a new chat in ${n}.`, "Come back to this page and tap Copy message.", "Paste it in the new chat and send it. Older chats may not see Rare Tomato."];
const msg = (n: string) => [
  `Tap Open ${n}, then start a new chat.`,
  "Come back to this page and tap Copy message.",
  `Go back to ${n}, paste the message in the new chat and send it. ${n} will set up Rare Tomato and ask you to sign in.`,
];

/** The numbered lines of the open-first screens (round 9). */
export const R9 = {
  goBack,
  c2: ["Tap Open Claude connectors. Claude opens the form.", "Come back to this page and tap Copy next to an item.", "Go back to Claude's form and paste it where it says. Do the same for the other item."],
  c5: [
    "Tap Open Claude instructions. Your Claude profile opens.",
    "Come back to this page and tap Copy instruction.",
    "Go back to Claude and paste it at the end of the Instructions box. You don't need to change anything that's already there. Then save.",
  ],
  g2: [
    "Tap Open ChatGPT. Do this at chatgpt.com in a web browser. ChatGPT's phone app doesn't let you add this.",
    "Come back to this page and tap Copy next to the address.",
    "Go back to ChatGPT and paste it where it asks for the server address (URL).",
  ],
  g5: [
    "Tap Open ChatGPT instructions. Your personalization settings open.",
    "Come back to this page and tap Copy instruction.",
    "Go back to ChatGPT and paste it into Custom Instructions > ChatGPT, at the end of anything already there. Then save.",
  ],
  chat,
  grokMsg: msg("Grok Bot"),
  museMsg: msg("Muse"),
};

export interface AgentCopy {
  name: string;
  intro?: { title: string; body: string; list: string[]; small?: string; next: string };
  /** Claude and ChatGPT: the form details. */
  form?: {
    title: string;
    lines: string[];
    items: { label: string; value: string; copy: string; where: string }[];
    choose?: string;
    options?: [string, string][];
    steps?: string[];
    small: string;
    main: string;
    link?: string;
    help?: string;
    shot: string;
  };
  /** Grok Bot and Muse: the one pasted message. */
  message?: { tag?: string; title: string; lines: string[]; msg: string; copy: string; main: string; goBack: string; notice?: string };
  wait: { title: string; body: string; help: string | null; list: string[] };
  confirm: { title: string; body: string; label: string; value: string; small: string; button: string };
  instr?: { title: string; body: string; text: string; copy: string; open: string; saved: string; lines: string[]; goBack: string; shot: string };
  check: {
    title: string;
    lines: string[];
    msg: string;
    copy: string;
    open: string;
    goBack: string;
    rows: string[];
    waiting: string;
    ok: { title: string; body: string; button: string };
    part: { title: string; body: string; msg: string; copy: string };
    none: { title: string; body: string; list: string[]; button: string };
  };
  rule: { title: string; body: string; ph: string; exLabel: string; ex: string; save: string; quiet: string };
  done: { title: string; body: string; button: string };
  summary: string;
  finish: string;
}

function common(n: string): Omit<AgentCopy, "check"> & { check: Omit<AgentCopy["check"], "lines" | "open" | "goBack"> } {
  return {
    name: n,
    wait: {
      title: `Waiting for ${n}`,
      body: `Finish connecting in ${n}, then come back here. This page updates by itself.`,
      help: "Need help?",
      list: [
        `Already connected? Check that Rare Tomato shows as connected in ${n}'s connectors list.`,
        `${n} said it couldn't connect? Remove Rare Tomato in ${n}, add it again, and sign in if asked.`,
        "You may not be asked to sign in again if you're already signed in. That's fine.",
      ],
    },
    confirm: {
      title: `${n} is connected`,
      body: "Give it a name so you can tell your agents apart.",
      label: "What do you call it?",
      value: n,
      small: `Only you see this name. Until you confirm, ${n} can't see your rules.`,
      button: "Confirm",
    },
    check: {
      title: "Let's check it works",
      msg: "Check my Rare Tomato rules now and use any that apply.",
      copy: "Copy message",
      rows: [`${n} checked your rules`, `${n} reported the test task`],
      waiting: "Waiting",
      ok: { title: `${n} is ready`, body: `Rare Tomato saw ${n} check your rules and report a task.`, button: "Continue" },
      part: {
        title: "Almost there",
        body: `${n} can read your rules, but it didn't report the task. Reply to ${n} with this message:`,
        msg: "Now report what you did to Rare Tomato.",
        copy: "Copy message",
      },
      none: {
        title: `We haven't seen ${n} yet`,
        body: "Try these, then check again.",
        list: ["Open your instructions again and check the text was saved.", "Start a new chat and send the message again.", "Make sure Rare Tomato is switched on in the chat's connectors."],
        button: "Check again",
      },
    },
    rule: {
      title: "Write your first rule",
      body: "Rules are your instructions for how agents work for you. Start with one.",
      ph: "Type a rule in your own words",
      exLabel: "Example",
      ex: "Ask before sharing my phone number or address.",
      save: "Save rule",
      quiet: `Rules are advice. ${n} decides whether to follow them.`,
    },
    done: {
      title: "You're set up",
      body: `${n} will see your rule the next time it checks. When ${n} finishes a task, it shows up under Agent Activity, and you can tell us if something went wrong.`,
      button: "Go to Home",
    },
    summary: `${n} is connected as ${n}`,
    finish: `Finish setting up ${n}`,
  };
}

function instrOf(n: string, lines: string[]) {
  return {
    title: `Tell ${n} to check Rare Tomato`,
    body: `${n} only checks your rules if you ask it to. Add this instruction once.`,
    text: AGENT_INSTRUCTION,
    copy: "Copy instruction",
    open: `Open ${n} instructions`,
    saved: "I've saved it",
    lines,
    goBack: goBack(n),
    shot: n === "Claude" ? "Claude's Profile screen, Instructions box" : "ChatGPT's Custom instructions screen",
  };
}

function build(): Record<AgentKey, AgentCopy> {
  const withChat = (n: string, c: ReturnType<typeof common>): AgentCopy => ({
    ...c,
    check: { ...c.check, lines: R9.chat(n), open: `Start a new chat in ${n}`, goBack: goBack(n) },
  });
  const claude = withChat("Claude", common("Claude"));
  claude.intro = {
    title: "Connect Rare Tomato to Claude",
    body: "You'll add Rare Tomato to Claude, then come right back here. Here's what to expect:",
    list: ["Claude opens a form. You paste in two details from this page.", "You pick two options we'll show you.", "Claude may ask you to sign in, then start a new chat. That's normal. Come back to this page. We'll be waiting."],
    next: "Next",
  };
  claude.form = {
    title: "Fill in Claude's form",
    lines: R9.c2,
    items: [
      { label: "Name", value: "Rare Tomato", copy: "Copy", where: "Paste it into the box at the top of the form, where it says the connector's name." },
      { label: "Address", value: MCP_URL, copy: "Copy", where: "Paste it into the box under the name, where it asks for the address (URL)." },
    ],
    choose: "Then choose these two options in the form:",
    options: [["Under Authentication, choose: ", "Sign in now"], ["Under OAuth client, choose: ", "Use Claude's published identity"]],
    small: "Leave everything else as it is. Then tap Add or Connect at the bottom of the form.",
    main: "Open Claude connectors",
    link: "I can't find it",
    help: "In Claude, open Settings, then Connectors, then Add, then Add custom connector.",
    shot: "Claude's Add custom connector form",
  };
  claude.instr = instrOf("Claude", R9.c5);

  const chatgpt = withChat("ChatGPT", common("ChatGPT"));
  chatgpt.intro = {
    title: "Connect Rare Tomato to ChatGPT",
    body: "You'll add Rare Tomato to ChatGPT, then come right back here. Here's what to expect:",
    list: ["ChatGPT opens a form. You paste in details from this page.", "ChatGPT scans Rare Tomato's tools.", "You sign in to Rare Tomato when asked, then finish. Come back to this page. We'll be waiting."],
    small: "Do this part in a web browser at chatgpt.com. ChatGPT's phone app doesn't let you add this.",
    next: "Next",
  };
  chatgpt.form = {
    title: "Fill in ChatGPT's form",
    lines: R9.g2,
    items: [{ label: "Address", value: MCP_URL, copy: "Copy", where: "Paste it into the box where ChatGPT asks for the server address (URL)." }],
    steps: ["Open Settings.", "Turn on Developer mode if ChatGPT asks.", "Choose Create app.", "Paste the address.", "Scan the tools.", "Sign in to Rare Tomato when asked.", "Finish creating the app."],
    small: "This may need a paid ChatGPT plan.",
    main: "Open ChatGPT",
    shot: "ChatGPT's form for adding an app",
  };
  chatgpt.instr = instrOf("ChatGPT", R9.g5);

  const grok = withChat("Grok Bot", common("Grok Bot"));
  grok.message = { title: "Connect Rare Tomato to Grok Bot", lines: R9.grokMsg, msg: GROK_MESSAGE, copy: "Copy message", main: "Open Grok Bot", goBack: goBack("Grok Bot") };
  grok.wait = {
    title: "Waiting for Grok Bot",
    body: "Finish signing in in Grok Bot, then come back here. This page updates by itself.",
    help: "Need help?",
    list: [`Grok Bot didn't connect? Open Grok Bot's connectors and add Rare Tomato with this address: ${MCP_URL}`],
  };

  const muse = withChat("Muse", common("Muse"));
  muse.message = { tag: "Experimental", title: "Connect Rare Tomato to Muse", lines: R9.museMsg, msg: MUSE_MESSAGE, copy: "Copy message", main: "Open Muse", goBack: goBack("Muse"), notice: MUSE_NOTICE };
  muse.wait = { title: "Waiting for Muse", body: "Finish signing in in Muse, then come back here. This page updates by itself.", help: null, list: [] };

  return { claude, chatgpt, grok, muse };
}

export const COPY: Record<AgentKey, AgentCopy> = build();
