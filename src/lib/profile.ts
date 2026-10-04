import type { Db } from "@/db/client";
import { hardDeleteFact } from "@/db/purge";
import { tenantDb, type Row } from "@/db/tenant";
import { checkText, looksSensitive, type Finding } from "./blocked-data";
import { decryptField, encryptField, type MasterKeys } from "./crypto";
import { getDataKey } from "./identity";

// The person's facts (spec section 5.2). Values are encrypted at rest with the person's own data key.
// Every read and write goes through the tenant layer, so it only ever touches this person's rows.

export const CATEGORIES = ["preferences", "contacts", "family"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SOURCES = ["manual", "import", "correction"] as const;
export type Source = (typeof SOURCES)[number];

/** Sensitivity tier is set by category and cannot be lowered by the person (FR-B1). */
export const TIER: Record<Category, number> = { preferences: 1, contacts: 2, family: 3 };

/** Cap on details per person (FR-I1). */
export const FACT_CAP = 200;
const MAX_KEY = 80;
const MAX_VALUE = 1000;

export interface Fact {
  id: string;
  category: Category;
  tier: number;
  key: string;
  value: string;
  source: Source;
  /** Shown as "Sensitive" in the app. Worked out from the text each time (best-effort, not a guarantee), so an edit is re-labeled. */
  sensitive: boolean;
  lastReviewedAt: Date | null;
  /** null = every agent that holds the category's permission can see it. A list = only those connections (open item 19). */
  allowedAgentIds: string[] | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FactInput = { category: Category; key: string; value: string; source?: Source };
export type SaveResult =
  | { ok: true; fact: Fact; warnings: Finding[] }
  | { ok: false; reason: "rejected" | "needs_confirmation" | "invalid" | "cap_reached" | "not_found"; findings: Finding[]; message: string };

interface Context {
  db: Db;
  masters: MasterKeys;
  userId: string;
}

async function toFact(ctx: Context, row: Row, key?: Buffer): Promise<Fact> {
  const dataKey = key ?? (await getDataKey(ctx.db, ctx.userId, ctx.masters));
  const value = decryptField(dataKey, row.valueEncrypted as string, ctx.userId, "profile_fact.value");
  return {
    id: row.id as string,
    category: row.category as Category,
    tier: row.tier as number,
    key: row.key as string,
    value,
    source: row.source as Source,
    sensitive: looksSensitive(`${row.key as string} ${value}`),
    lastReviewedAt: (row.lastReviewedAt as Date | null) ?? null,
    allowedAgentIds: (row.allowedAgentIds as string[] | null) ?? null,
    createdAt: row.createdAt as Date,
    updatedAt: row.updatedAt as Date,
  };
}

function validate(input: FactInput): string | null {
  if (!CATEGORIES.includes(input.category)) return "Choose preferences, contacts, or family.";
  if (!input.key.trim() || input.key.length > MAX_KEY) return `Give it a short label (up to ${MAX_KEY} characters).`;
  if (!input.value.trim() || input.value.length > MAX_VALUE) return `Details must be 1 to ${MAX_VALUE} characters.`;
  return null;
}

/** Runs the blocked-data check on the label and the details. Rejects always block; warnings need a confirmation. */
function screen(input: FactInput, confirmedWarnings: boolean): SaveResult | { ok: true; warnings: Finding[] } {
  const result = checkText(`${input.key}\n${input.value}`);
  if (result.verdict === "reject") {
    return { ok: false, reason: "rejected", findings: result.rejects, message: result.rejects[0].message };
  }
  if (result.verdict === "warn" && !confirmedWarnings) {
    return { ok: false, reason: "needs_confirmation", findings: result.warns, message: result.warns[0].message };
  }
  return { ok: true, warnings: result.warns };
}

export function profileService(db: Db, masters: MasterKeys, userId: string) {
  const ctx: Context = { db, masters, userId };
  const t = tenantDb(db, userId);

  async function listAll(categories?: Category[]): Promise<Fact[]> {
    const rows = (await t.profileFacts.list()) as Row[];
    const key = await getDataKey(db, userId, masters);
    const wanted = categories ? rows.filter((r) => categories.includes(r.category as Category)) : rows;
    return Promise.all(wanted.map((r) => toFact(ctx, r, key)));
  }

  return {
    list: listAll,

    /**
     * What ONE agent may be given: the facts in these categories that are not limited to other agents. The caller has already checked that
     * the agent holds the category's permission. A fact limited to a list is withheld from every connection not on it, with no placeholder
     * and no hint that it exists.
     */
    async listForAgent(connectionId: string, categories: Category[]): Promise<Fact[]> {
      const facts = await listAll(categories);
      return facts.filter((f) => f.allowedAgentIds === null || f.allowedAgentIds.includes(connectionId));
    },

    /**
     * "Only to agents I choose" (open item 19). Pass null to go back to the category default. Every id must be one of THIS person's
     * confirmed, connected agents; anything else is refused with a plain message and nothing is changed.
     */
    async setVisibility(id: string, agentIds: string[] | null): Promise<{ ok: true } | { ok: false; message: string }> {
      const existing = await t.profileFacts.get(id);
      if (!existing) return { ok: false, message: "That detail was not found." };
      let clean: string[] | null = null;
      if (agentIds !== null) {
        const mine = ((await t.agentConnections.list()) as { id: string; linkConfirmedAt: Date | null; revokedAt: Date | null }[]).filter((c) => c.linkConfirmedAt && !c.revokedAt);
        clean = [...new Set(agentIds)];
        if (!clean.every((x) => mine.some((c) => c.id === x))) return { ok: false, message: "One of those agents is not one of your connected agents. Nothing was changed." };
      }
      await t.profileFacts.update(id, { allowedAgentIds: clean });
      return { ok: true };
    },

    async get(id: string): Promise<Fact | null> {
      const row = await t.profileFacts.get(id);
      return row ? toFact(ctx, row) : null;
    },

    async add(input: FactInput, opts: { confirmedWarnings?: boolean } = {}): Promise<SaveResult> {
      const invalid = validate(input);
      if (invalid) return { ok: false, reason: "invalid", findings: [], message: invalid };
      const screened = screen(input, opts.confirmedWarnings ?? false);
      if (!screened.ok) return screened;
      if ((await t.profileFacts.list()).length >= FACT_CAP) {
        return { ok: false, reason: "cap_reached", findings: [], message: `You have reached the limit of ${FACT_CAP} details.` };
      }
      const key = await getDataKey(db, userId, masters);
      // A NEW detail that looks like a health detail (it is labeled Sensitive) starts as "Only the agents I choose" with NO agent chosen, so no agent can
      // read it until the person ticks one. Details saved before this change are not touched, and neither is an edit of an existing detail.
      const startsLimited = looksSensitive(`${input.key} ${input.value}`);
      const row = await t.profileFacts.insert({
        category: input.category,
        tier: TIER[input.category],
        key: input.key.trim(),
        valueEncrypted: encryptField(key, input.value.trim(), userId, "profile_fact.value"),
        source: input.source ?? "manual",
        lastReviewedAt: new Date(),
        ...(startsLimited ? { allowedAgentIds: [] } : {}),
      });
      return { ok: true, fact: await toFact(ctx, row, key), warnings: screened.warnings };
    },

    /** Editing re-runs the same checks. The tier always follows the category; it cannot be set directly. */
    async update(id: string, input: FactInput, opts: { confirmedWarnings?: boolean } = {}): Promise<SaveResult> {
      const invalid = validate(input);
      if (invalid) return { ok: false, reason: "invalid", findings: [], message: invalid };
      const existing = await t.profileFacts.get(id);
      if (!existing) return { ok: false, reason: "not_found", findings: [], message: "That detail was not found." };
      const screened = screen(input, opts.confirmedWarnings ?? false);
      if (!screened.ok) return screened;
      const key = await getDataKey(db, userId, masters);
      const row = await t.profileFacts.update(id, {
        category: input.category,
        tier: TIER[input.category],
        key: input.key.trim(),
        valueEncrypted: encryptField(key, input.value.trim(), userId, "profile_fact.value"),
        lastReviewedAt: new Date(),
      });
      return { ok: true, fact: await toFact(ctx, row as Row, key), warnings: screened.warnings };
    },

    async markReviewed(id: string): Promise<boolean> {
      return (await t.profileFacts.update(id, { lastReviewedAt: new Date() })) !== null;
    },

    /** Deletes it for good, at once (FR-H3). Agents never see it again. A copy an agent already keeps in its own memory is outside our control. */
    async remove(id: string): Promise<boolean> {
      return hardDeleteFact(db, userId, id);
    },
  };
}

export type ProfileService = ReturnType<typeof profileService>;
