// Every link that sends a person out of Rare Tomato during setup, in one place, by the ids in the round 9 handoff (L1 to L11, plus L3b).
// Each has a url or null, and a status: "confirmed" (Lia supplied it), "partial" (it opens the vendor's home page; a deeper link is still to be
// found) or "verify" (no link yet). A link whose url is null is not drawn at all: no button, nothing that goes nowhere. Nothing here is guessed.
// To fix a [VERIFY] item, change one line below.

export type LinkStatus = "confirmed" | "partial" | "verify";
export type LinkId = "L1" | "L2" | "L3" | "L3b" | "L4" | "L5" | "L6" | "L7" | "L8" | "L9" | "L10" | "L11";

export interface AgentLink {
  id: LinkId;
  agent: "Claude" | "ChatGPT" | "Grok Bot" | "Muse";
  /** What the link goes to, for people maintaining this file. */
  what: string;
  url: string | null;
  status: LinkStatus;
}

export const AGENT_LINKS: Record<LinkId, AgentLink> = {
  L1: { id: "L1", agent: "Claude", what: "Add custom connector", url: "https://claude.ai/settings/connectors?modal=add-custom-connector", status: "confirmed" },
  L2: { id: "L2", agent: "Claude", what: "Profile, Instructions box", url: "https://claude.ai/settings/profile", status: "confirmed" },
  L3: { id: "L3", agent: "Claude", what: "New chat", url: "https://claude.ai/new", status: "confirmed" },
  L3b: { id: "L3b", agent: "Claude", what: "The chat the person is already in (no deep link known)", url: null, status: "verify" },
  L4: { id: "L4", agent: "ChatGPT", what: "Home. VERIFY: a deeper link to where apps are added", url: "https://chatgpt.com", status: "partial" },
  L5: { id: "L5", agent: "ChatGPT", what: "Personalization settings", url: "https://chatgpt.com/settings/personalization", status: "confirmed" },
  L6: { id: "L6", agent: "ChatGPT", what: "New chat (home)", url: "https://chatgpt.com", status: "confirmed" },
  L7: { id: "L7", agent: "Grok Bot", what: "Home. VERIFY: the exact new-chat link", url: "https://grok.com", status: "partial" },
  L8: { id: "L8", agent: "Grok Bot", what: "Connectors page", url: null, status: "verify" },
  L9: { id: "L9", agent: "Grok Bot", what: "Home. VERIFY: the exact new-chat link", url: "https://grok.com", status: "partial" },
  L10: { id: "L10", agent: "Muse", what: "New chat (supplied by Lia)", url: "https://muse.ai/thread/new", status: "confirmed" },
  L11: { id: "L11", agent: "Muse", what: "New chat (supplied by Lia)", url: "https://muse.ai/thread/new", status: "confirmed" },
};

/** The address behind a link id, or null when there is none (the caller then draws nothing). */
export const linkUrl = (id: LinkId): string | null => AGENT_LINKS[id].url;

/** Links that are not confirmed, for the build report and for dev builds. */
export const unconfirmedLinks = (): AgentLink[] => Object.values(AGENT_LINKS).filter((l) => l.status !== "confirmed");

/** The attributes every outbound link gets: a new tab, and no access back to this page. */
export const OUTBOUND = { target: "_blank", rel: "noopener noreferrer" } as const;
