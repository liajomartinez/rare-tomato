import { CARE_SHEET_NAME, MUSE_LIMIT } from "./strings";

// Per-agent connection guides (SPEC 11.5, D3), kept as data so a menu name that changes is a one-line change (design note O11: menus change
// often, so check them before launch). Based on what was observed in the spikes and experiments (the project notes*.md, docs/experiments/).
// Honest limits are part of every guide. The longer versions are in docs/guides/, and a test keeps the two in step.
//
// The last step of every live guide points to the "starter line" (design item O7, approved by Lia 2026-10-03). The line itself, where it goes
// and the check question are in onboarding.ts and strings.ts, and shown on Your agents once an agent is confirmed. The measurements behind it
// are in the project notes (a small test).

export type GuideId = "claude" | "chatgpt" | "grok" | "muse" | "instinct";

export interface Guide {
  id: GuideId;
  name: string;
  /** Connects live, or only through the care sheet. */
  mode: "live" | "care_sheet";
  steps: string[];
  expect: string[];
  limits: string[];
}

export const GUIDES: Guide[] = [
  {
    id: "claude",
    name: "Claude",
    mode: "live",
    steps: [
      "In Claude (claude.ai on the web), open Settings, then Connectors, and choose to add a custom connector.",
      "Name it Rare Tomato and paste the address from Your agents. Leave the sign-in choice on the default.",
      "Sign in with the same account you use here when Claude asks.",
      "Come back to Your agents. Claude appears under New agents waiting for you. Choose Claude, name it, and confirm.",
      "Start a new chat in Claude. (An older chat may not see the tools.)",
      "Paste the starter line from Your agents into Claude's preferences, then run the check question. In our tests Claude did not call Rare Tomato until it was told to.",
    ],
    expect: ["Claude can read your rules and the details you allowed, and record what it did, when it decides to.", "The first thing it can do before you confirm is say hello."],
    limits: [
      "Claude does not necessarily check Rare Tomato on its own. In our tests it made no calls until it was told to.",
      "If you add a new tool later, Claude may need the connector removed and added again to see it.",
    ],
  },
  {
    id: "chatgpt",
    name: "ChatGPT",
    mode: "live",
    steps: [
      "Use ChatGPT on the web (custom apps are not in the phone or desktop app). In Settings, open Integrations, then Plugins, and choose Create MCP app. (Older versions call this Apps and Connectors with a Developer mode switch.)",
      "Name it Rare Tomato, paste the address from Your agents, and choose OAuth for sign-in.",
      "Sign in with the same account you use here.",
      "Come back to Your agents, find ChatGPT under New agents waiting for you, name it, and confirm.",
      "Start a new chat in ChatGPT.",
      "Paste the starter line from Your agents into ChatGPT's custom instructions, then run the check question. In our tests ChatGPT did not call Rare Tomato until it was told to.",
    ],
    expect: ["ChatGPT can read your rules and allowed details and record what it did, when it decides to.", "It has worked on a ChatGPT Plus account."],
    limits: [
      "Where the setting lives has changed between versions, so the menu names above may differ for you.",
      "In our tests ChatGPT made no calls until it was told to.",
    ],
  },
  {
    id: "grok",
    name: "Grok Bot",
    mode: "live",
    steps: [
      "In Grok Bot, ask it in the chat to add an MCP server, and give it the address from Your agents.",
      "It sends you to a sign-in page. Sign in with the same account you use here.",
      "Come back to Your agents, find it under New agents waiting for you, name it, and confirm.",
      "Start a new chat in Grok Bot.",
      "No setup step is needed: Grok Bot looked at the rules on its own in every test. The starter line from Your agents is optional; if you want it, paste it at the start of a chat. (Grok Bot's Auto-review Rules screen is about which actions are allowed automatically, not standing instructions, so do not put the line there.) Grok Bot runs in the desktop app only.",
    ],
    expect: ["Grok Bot can read your rules and allowed details and record what it did.", "In our tests it did look at the rules without being told to."],
    limits: ["The Marketplace tab in Grok Bot is for ready-made plugins and has no custom option, so adding it by chat is the way we found."],
  },
  {
    id: "muse",
    name: "Muse",
    mode: "live",
    steps: [
      "In a chat with Muse, ask it to set up a custom connector for the address from Your agents (it speaks streamable HTTP). To reconnect later: Settings, then Connectors, then Rare Tomato, then Disconnect, and do this again.",
      "Muse shows a Connect card. Choose Connect.",
      "A sign-in approval page opens. Approve it with the same account you use here.",
      "Come back to Your agents, find Muse under New agents waiting for you, name it, and confirm.",
      "Start a new chat in Muse and ask it to use the Rare Tomato hello tool.",
      "Then tell Muse in the chat itself to check Rare Tomato (Your agents has the sentence, with a Copy button). In our tests the starter line in SOUL.md or in Muse's Memory did not make Muse check on its own; telling it in the chat did.",
    ],
    expect: ["Muse builds its own small helper to talk to the connector, and decides for itself when to use it.", "Muse may keep what it reads in its own memory."],
    limits: [MUSE_LIMIT, "Muse's own words about why a request failed are its own report, not something we can check."],
  },
  {
    id: "instinct",
    name: "Instinct",
    mode: "care_sheet",
    steps: [
      `Instinct does not connect live. Open ${CARE_SHEET_NAME} in Rare Tomato.`,
      "Choose which kinds of details to include, and copy the sheet.",
      "Paste it into Instinct's own memory or instructions.",
    ],
    expect: ["Instinct gets a snapshot of your approved rules and the details you chose."],
    limits: ["It is a snapshot and goes out of date when you change a rule or a detail. Pasting it asks Instinct to read it; nothing makes it follow it."],
  },
];

export const guideFor = (id: string) => GUIDES.find((g) => g.id === id);
