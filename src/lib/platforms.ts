import type { AgentType } from "./connections";

// What differs between the platforms in setup. Menu names and links stay data here (and in strings.ts), so a change is a one-line change (O11).

export const TYPE_LABEL: Record<AgentType, string> = { claude: "Claude", chatgpt: "ChatGPT", muse: "Muse", grok: "Grok Bot", other: "Another agent" };

/** "2 Oct": the day, from our own record (UTC). */
export const shortDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
/** The day and the time in UTC, for the unconfirmed-agent expiry. */
export const shortWhen = (d: Date) => d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "UTC" }).replace(",", "") + " UTC";

export const isGuided = (type: AgentType | null): type is "claude" | "chatgpt" => type === "claude" || type === "chatgpt";
