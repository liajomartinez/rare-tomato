import type { Db } from "@/db/client";
import type { MasterKeys } from "./crypto";
import { CATEGORIES, profileService, type Category } from "./profile";
import { rulesService } from "./rules";
import { CARE_SHEET_NAME_LOWER } from "./strings";

// The care sheet (spec FR-G2): a markdown block of the person's active rules and the details they choose to include, with a dated header,
// for agents that cannot connect through MCP. It never holds a detail outside the categories the person picked. It is a snapshot, and it is
// written as the person's own request to the agent: nothing in it can make an agent follow anything, and the text says so plainly.

export interface CareSheetOptions {
  categories: Category[];
  /** Health details the person marked sensitive are left out unless they ask for them. */
  includeSensitive?: boolean;
  now?: Date;
}

const LABEL: Record<Category, string> = { preferences: "Preferences", contacts: "Contacts", family: "Family" };
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

export async function careSheet(db: Db, masters: MasterKeys, userId: string, opts: CareSheetOptions): Promise<string> {
  const now = opts.now ?? new Date();
  const wanted = CATEGORIES.filter((c) => opts.categories.includes(c));
  const [rules, facts] = await Promise.all([
    rulesService(db, userId).list(),
    wanted.length ? profileService(db, masters, userId).list(wanted) : Promise.resolve([]),
  ]);

  // Rules for all agents only: a sheet is not tied to one agent. Newest first.
  const live = rules.filter((r) => r.status === "active" && r.scope === "all");
  const ordered = [...live].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const lines: string[] = [];
  lines.push(`# My ${CARE_SHEET_NAME_LOWER} (made ${now.toISOString().slice(0, 10)})`);
  lines.push("");
  lines.push(
    "This is a snapshot of my preferences and my rules, from Rare Tomato. They are my own requests for how I would like you to help me. " +
      "Please read them before you plan, message, book or buy anything for me, and tell me if you cannot follow one. " +
      "It was copied on the date above, so it may be out of date.",
  );
  lines.push("");
  lines.push("## My rules");
  if (ordered.length === 0) lines.push("(No rules yet.)");
  for (const r of ordered) {
    lines.push(`- ${oneLine(r.text)} (applies when: ${oneLine(r.when)})`);
  }
  for (const category of wanted) {
    // A detail the person limited to chosen agents never goes on the sheet: the sheet is pasted into an agent we cannot name.
    const items = facts.filter((f) => f.category === category && (f.allowedAgentIds === null || (opts.includeSensitive && f.sensitive && f.allowedAgentIds.length === 0)) && (opts.includeSensitive || !f.sensitive));
    lines.push("");
    lines.push(`## ${LABEL[category]}`);
    if (items.length === 0) lines.push("(Nothing added.)");
    for (const f of items) lines.push(`- ${oneLine(f.key)}: ${oneLine(f.value)}${f.sensitive ? " (sensitive)" : ""}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Made with Rare Tomato. Rules here are my advice, not something anyone can force; what an agent tells me it did is its own report.");
  return lines.join("\n");
}
