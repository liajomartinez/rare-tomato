import type { AgentType } from "./connections";
import { linkFor, S, type LinkKey } from "./strings";

// What differs between the platforms in setup. Menu names and links stay data here (and in strings.ts), so a change is a one-line change (O11).

export const TYPE_LABEL: Record<AgentType, string> = { claude: "Claude", chatgpt: "ChatGPT", muse: "Muse", grok: "Grok Bot", other: "Another agent" };

/** "2 Oct": the day, from our own record (UTC). */
export const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** The day and the time in UTC, for the unconfirmed-agent expiry. */
export const shortWhen = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(",", "") + " UTC";

/** The guided platforms (Claude, ChatGPT): their connect and instruction screens. */
export const GUIDED = {
  claude: { connect: S.onb.setup.claude.connect, instr: S.onb.setup.claude.instr, connectLink: "openClaudeConnectors", instrLink: "openClaudeInstructions", afterLink: "openClaudeAfterSetup" },
  chatgpt: { connect: S.onb.setup.chatgpt.connect, instr: S.onb.setup.chatgpt.instr, connectLink: "openChatGPTAppSettings", instrLink: "openCustomInstructions", afterLink: "openChatGPTAfterSetup" },
} as const satisfies Record<string, { connect: unknown; instr: unknown; connectLink: LinkKey; instrLink: LinkKey; afterLink: LinkKey }>;

export const isGuided = (type: AgentType | null): type is "claude" | "chatgpt" => type === "claude" || type === "chatgpt";

/** The link behind "Open <platform>" for a message platform, or null when the design gave none. */
export const messageLinkKey = (type: AgentType): LinkKey | null => (type === "grok" ? "open_grok_bot" : type === "muse" ? "openMuse" : null);
export { linkFor };
