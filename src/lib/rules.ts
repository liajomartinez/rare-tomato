import type { Db } from "@/db/client";
import { hardDeleteRule } from "@/db/purge";
import { tenantDb, type Row } from "@/db/tenant";
import { firstReject } from "./blocked-data";
import { sanitizeText } from "./sanitize";
import { TASK_CATEGORIES } from "./tasks";

// Rules are advice the person has approved for how their agents should act (spec 5.4, 6.4).
// Nothing here forces an agent to follow a rule; agents pull rules and may ignore them.
// A rule becomes active or locked ONLY through approve() or editAndApprove(), which record an approval
// event made by the person (FR-E5). There is no other code path that sets those statuses.

export const RULE_LIMITS = { text: 300, when: 200, action: 300, because: 500 } as const;
export const STRENGTHS = ["prefer", "always", "never"] as const;
export type Strength = (typeof STRENGTHS)[number];

export interface RuleDraft {
  text: unknown;
  category: unknown;
  /** "all" or "agent:<connection id>". */
  scope?: unknown;
  when: unknown;
  do?: unknown;
  dont?: unknown;
  strength?: unknown;
  because: unknown;
  sourceFeedbackId?: string | null;
  /** Which version of the writer prompt produced this proposal (spec 6.1). */
  promptVersion?: string;
  confidence?: number;
  /**
   * Set only for a draft shown to the person right after a thumbs-down (run 7). Such a draft is never served and is deleted when the person
   * taps Not now or when this time passes. Proposals with no expiry (an agent's reported correction, or one made before run 7) stay until decided.
   */
  draftExpiresAt?: Date;
}

export interface RuleRecord {
  id: string;
  text: string;
  category: string;
  scope: string;
  status: "proposed" | "active" | "locked" | "retired";
  version: number;
  supersedesId: string | null;
  sourceFeedbackId: string | null;
  when: string;
  do: string | null;
  dont: string | null;
  strength: Strength;
  because: string;
  approvedAt: Date | null;
  createdAt: Date;
  /** Set when the rule was proposed (spec 6.3). Null if no check was run. */
  conflictCheck: ConflictCheck | null;
  /** Live rules this one was kept alongside although they overlap (from "keep both"). */
  conflictsWith: string[];
  /** Only on a draft shown right after a thumbs-down: when it is deleted if the person has not decided. null for every other rule. */
  draftExpiresAt: Date | null;
}

/** What the conflict check (spec 6.3) found when a new rule was compared with one live rule. `unchecked` means the check could not be done. */
export type ConflictVerdict = "duplicate" | "contradicts" | "refines" | "independent" | "unchecked";
export interface ConflictCheck {
  checkedAt: string;
  promptVersion: string;
  results: { ruleId: string; verdict: ConflictVerdict }[];
}

export type RuleResult<T = RuleRecord> =
  | { ok: true; rule: T }
  | { ok: false; reason: "invalid_input" | "not_found" | "wrong_state" | "needs_choice"; message: string };

const SCOPE = /^(all|agent:[0-9a-f-]{36})$/i;
const fail = (reason: "invalid_input" | "not_found" | "wrong_state" | "needs_choice", message: string) => ({ ok: false as const, reason, message });

function clean(draft: RuleDraft):
  | { ok: true; value: { text: string; category: string; scope: string; structured: Row } }
  | { ok: false; message: string } {
  const text = sanitizeText(draft.text, RULE_LIMITS.text);
  const when = sanitizeText(draft.when, RULE_LIMITS.when);
  const because = sanitizeText(draft.because, RULE_LIMITS.because);
  const doText = sanitizeText(draft.do, RULE_LIMITS.action) || null;
  const dontText = sanitizeText(draft.dont, RULE_LIMITS.action) || null;
  const blocked = firstReject([text, when, because, doText, dontText].filter(Boolean).join(" "));
  if (blocked) return { ok: false, message: blocked.message };
  if (!text) return { ok: false, message: "A rule needs some text." };
  if (!when) return { ok: false, message: "A rule needs to say when it applies." };
  if (!because) return { ok: false, message: "A rule needs the reason it was made." };
  if (!(TASK_CATEGORIES as readonly string[]).includes(draft.category as string)) return { ok: false, message: "Unknown category." };
  const scope = draft.scope === undefined ? "all" : String(draft.scope);
  if (!SCOPE.test(scope)) return { ok: false, message: "Scope must be all or one agent." };
  const strength = draft.strength === undefined ? "prefer" : (draft.strength as string);
  if (!(STRENGTHS as readonly string[]).includes(strength)) return { ok: false, message: "Unknown strength." };
  return {
    ok: true,
    value: {
      text,
      category: draft.category as string,
      scope: scope.toLowerCase(),
      structured: {
        when, do: doText, dont: dontText, strength, because,
        ...(typeof draft.promptVersion === "string" ? { prompt_version: draft.promptVersion.slice(0, 40) } : {}),
        ...(typeof draft.confidence === "number" ? { confidence: draft.confidence } : {}),
        ...(draft.draftExpiresAt instanceof Date ? { draft_expires_at: draft.draftExpiresAt.toISOString() } : {}),
      },
    },
  };
}

function toRecord(r: Row): RuleRecord {
  const s = (r.structured ?? {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    text: r.text as string,
    category: r.category as string,
    scope: r.scope as string,
    status: r.status as RuleRecord["status"],
    version: r.version as number,
    supersedesId: (r.supersedesId as string | null) ?? null,
    sourceFeedbackId: (r.sourceFeedbackId as string | null) ?? null,
    when: String(s.when ?? ""),
    do: (s.do as string | null) ?? null,
    dont: (s.dont as string | null) ?? null,
    strength: (s.strength as Strength) ?? "prefer",
    because: String(s.because ?? ""),
    approvedAt: (r.approvedAt as Date | null) ?? null,
    createdAt: r.createdAt as Date,
    conflictCheck: (s.conflict_check as ConflictCheck | undefined) ?? null,
    conflictsWith: Array.isArray(s.conflicts_with) ? (s.conflicts_with as string[]) : [],
    draftExpiresAt: typeof s.draft_expires_at === "string" && !Number.isNaN(Date.parse(s.draft_expires_at)) ? new Date(s.draft_expires_at) : null,
  };
}

/**
 * The fixed order agents see (spec 6.4): locked first, then rules for one specific agent, then a narrower
 * `when` (PROVISIONAL: taken as the longer condition text, a rough stand-in until a better measure is chosen;
 * see the limitation test and spec 6.4), then newer,
 * then id so the order never depends on how the database returned the rows.
 */
export function orderRules<T extends Pick<RuleRecord, "id" | "status" | "scope" | "when" | "createdAt">>(rules: T[]): T[] {
  return [...rules].sort(
    (a, b) =>
      Number(b.status === "locked") - Number(a.status === "locked") ||
      Number(b.scope !== "all") - Number(a.scope !== "all") ||
      b.when.length - a.when.length ||
      b.createdAt.getTime() - a.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export function rulesService(db: Db, userId: string) {
  const t = tenantDb(db, userId);

  async function load(id: string): Promise<RuleRecord | null> {
    const row = await t.rules.get(id);
    return row ? toRecord(row) : null;
  }

  async function recordApproval(ruleId: string, action: "rule_approved" | "rule_edited_and_approved" | "rule_locked" | "rule_retired" | "rule_dismissed" | "rule_replaced") {
    // The person did this, so the actor is "user". Only the rule id is stored, never its text.
    await t.auditLog.insert({ actor: "user", action: `${action}:${ruleId}`, categoriesRead: [] });
  }

  async function liveIds(): Promise<Set<string>> {
    return new Set(((await t.rules.list()) as Row[]).filter((r) => r.status === "active" || r.status === "locked").map((r) => r.id as string));
  }

  /** The one place a proposed rule becomes active or locked. Only the approval paths below call it (FR-E5). */
  async function activate(id: string, opts: { lock?: boolean; conflictsWith: string[]; now: Date }): Promise<RuleResult> {
    const row0 = await t.rules.get(id);
    const { draft_expires_at: _draft, ...kept } = (row0?.structured as Record<string, unknown>) ?? {};
    void _draft; // a saved rule is no longer a draft
    const structured = { ...kept, ...(opts.conflictsWith.length ? { conflicts_with: opts.conflictsWith } : {}) };
    const row = await t.rules.update(id, { status: opts.lock ? "locked" : "active", approvedAt: opts.now, approvedBy: userId, structured });
    await recordApproval(id, opts.lock ? "rule_locked" : "rule_approved");
    return { ok: true, rule: toRecord(row as Row) };
  }

  /** The edit itself: a new version takes the old one's place and is approved by the person. */
  async function editCore(id: string, draft: RuleDraft, now: Date): Promise<RuleResult> {
  const old = await load(id);
  if (!old) return fail("not_found", "No such rule.");
  if (old.status === "retired") return fail("wrong_state", "A retired rule cannot be edited.");
  const c = clean(draft);
  if (!c.ok) return fail("invalid_input", c.message);
  const row = await t.rules.insert({
    ...c.value,
    status: old.status === "proposed" ? "active" : old.status,
    version: old.status === "proposed" ? old.version : old.version + 1,
    supersedesId: old.id,
    sourceFeedbackId: draft.sourceFeedbackId ?? null,
    approvedAt: now,
    approvedBy: userId,
  });
  await t.rules.update(id, { status: "retired" });
  await recordApproval(row.id as string, "rule_edited_and_approved");
  return { ok: true, rule: toRecord(row) };
  }

  return {
    /** Creates a proposed rule. A proposed rule is never served to agents. */
    async propose(draft: RuleDraft): Promise<RuleResult> {
      const c = clean(draft);
      if (!c.ok) return fail("invalid_input", c.message);
      const row = await t.rules.insert({ ...c.value, status: "proposed", version: 1, sourceFeedbackId: draft.sourceFeedbackId ?? null });
      return { ok: true, rule: toRecord(row) };
    },

    /** Stores the result of the conflict check on a proposed rule. It only informs the person; it changes nothing else. */
    async setConflictCheck(id: string, check: ConflictCheck): Promise<void> {
      const row = await t.rules.get(id);
      if (!row || row.status !== "proposed") return;
      await t.rules.update(id, { structured: { ...((row.structured as Record<string, unknown>) ?? {}), conflict_check: check } });
    },

    /**
     * The person approves a proposed rule. Optionally locks it so it always wins (FR-E6).
     * If the conflict check found a contradiction with a live rule, a plain approval is refused: the person must choose
     * replace, keep both or merge (FR-E3). Overlaps that are not contradictions are kept side by side and recorded.
     */
    async approve(id: string, opts: { lock?: boolean } = {}, now = new Date()): Promise<RuleResult> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      if (rule.status !== "proposed") return fail("wrong_state", "Only a proposed rule can be approved.");
      const live = await liveIds();
      const open = (rule.conflictCheck?.results ?? []).filter((r) => live.has(r.ruleId) && r.verdict !== "independent" && r.verdict !== "unchecked");
      if (open.some((r) => r.verdict === "contradicts")) return fail("needs_choice", "This rule contradicts one of your rules. Choose whether to replace it, keep both, or merge them.");
      return activate(id, { lock: opts.lock, conflictsWith: open.map((r) => r.ruleId), now });
    },

    /**
     * The person's choice when a proposed rule overlaps a live one (FR-E3): replace the live rule, keep both, or merge
     * (an edited rule that takes the live rule's place). Every route records the person's approval.
     */
    async resolveConflict(
      id: string,
      choice: { kind: "replace" | "keep_both" | "merge"; targetId: string; lock?: boolean; draft?: RuleDraft },
      now = new Date(),
    ): Promise<RuleResult> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      if (rule.status !== "proposed") return fail("wrong_state", "Only a proposed rule can be resolved.");
      const target = await load(choice.targetId);
      const flagged = (rule.conflictCheck?.results ?? []).some((r) => r.ruleId === choice.targetId);
      if (!target || !flagged || (target.status !== "active" && target.status !== "locked")) return fail("invalid_input", "That is not one of the rules this proposal overlaps.");

      if (choice.kind === "keep_both") return activate(id, { lock: choice.lock, conflictsWith: [target.id], now });
      if (choice.kind === "replace") {
        const made = await activate(id, { lock: choice.lock || target.status === "locked", conflictsWith: [], now });
        if (!made.ok) return made;
        await t.rules.update(target.id, { status: "retired" });
        await recordApproval(target.id, "rule_replaced");
        return made;
      }
      // merge: the person's edited wording replaces the live rule
      if (!choice.draft) return fail("invalid_input", "Merging needs the merged wording.");
      const edited = await editCore(id, choice.draft, now);
      if (!edited.ok) return edited;
      if (choice.lock || target.status === "locked") await t.rules.update(edited.rule.id, { status: "locked" }).then(() => recordApproval(edited.rule.id, "rule_locked"));
      await t.rules.update(target.id, { status: "retired" });
      await recordApproval(target.id, "rule_replaced");
      return { ok: true, rule: (await load(edited.rule.id)) ?? edited.rule };
    },

    /**
     * The person edits a rule and approves the edit. This makes a NEW version (old one retired), so the
     * version history stays visible (FR-E2). A locked rule stays locked.
     */
    async editAndApprove(id: string, draft: RuleDraft, now = new Date()): Promise<RuleResult> {
      // An edit is an approval too, so it must not step around an unresolved contradiction (FR-E3).
      const rule = await load(id);
      if (rule?.status === "proposed") {
        const live = await liveIds();
        if ((rule.conflictCheck?.results ?? []).some((r) => r.verdict === "contradicts" && live.has(r.ruleId))) {
          return fail("needs_choice", "This rule contradicts one of your rules. Choose whether to replace it, keep both, or merge them.");
        }
      }
      return editCore(id, draft, now);
    },

    /** The person locks an active rule so it always wins (FR-E6). Only the person can do this; it is recorded. */
    async lock(id: string): Promise<RuleResult> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      if (rule.status !== "active") return fail("wrong_state", "Only an active rule can be locked.");
      const row = await t.rules.update(id, { status: "locked" });
      await recordApproval(id, "rule_locked");
      return { ok: true, rule: toRecord(row as Row) };
    },

    /**
     * "Not now": the person does not want this proposed rule. It is deleted for good, not kept as pending or as history (run 7).
     * Only a rule that is still only proposed can be discarded; anything else is left alone.
     */
    async discard(id: string): Promise<RuleResult<{ id: string }>> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      if (rule.status !== "proposed") return fail("wrong_state", "Only a rule that has not been saved can be discarded.");
      await hardDeleteRule(db, userId, id);
      return { ok: true, rule: { id } };
    },

    /** Deletes drafts shown after a thumbs-down whose time has passed without a decision. Never touches a rule with no expiry or a saved rule. */
    async purgeExpiredDrafts(now = new Date()): Promise<number> {
      const expired = (await this.list()).filter((r) => r.status === "proposed" && r.draftExpiresAt !== null && r.draftExpiresAt.getTime() < now.getTime());
      for (const r of expired) await hardDeleteRule(db, userId, r.id);
      return expired.length;
    },

    /** The person turns down a proposed rule ("not quite"). It is kept in the history as retired and never served. */
    async dismiss(id: string): Promise<RuleResult> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      if (rule.status !== "proposed") return fail("wrong_state", "Only a proposed rule can be turned down.");
      const row = await t.rules.update(id, { status: "retired" });
      await recordApproval(id, "rule_dismissed");
      return { ok: true, rule: toRecord(row as Row) };
    },

    async retire(id: string): Promise<RuleResult> {
      const rule = await load(id);
      if (!rule) return fail("not_found", "No such rule.");
      const row = await t.rules.update(id, { status: "retired" });
      await recordApproval(id, "rule_retired");
      return { ok: true, rule: toRecord(row as Row) };
    },

    async get(id: string): Promise<RuleRecord | null> {
      return load(id);
    },

    async list(): Promise<RuleRecord[]> {
      return ((await t.rules.list()) as Row[]).map(toRecord);
    },

    /** What an agent may see: active and locked rules for everyone or for this agent, in the fixed order. */
    async servedTo(connectionId: string): Promise<RuleRecord[]> {
      const live = (await this.list()).filter(
        (r) => (r.status === "active" || r.status === "locked") && (r.scope === "all" || r.scope === `agent:${connectionId}`),
      );
      return orderRules(live);
    },
  };
}
