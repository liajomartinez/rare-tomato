import { sql } from "drizzle-orm";
import {
  boolean, foreignKey, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, unique, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";

// Tables follow spec section 10. Every table has id, created_at, updated_at, user_id (except users)
// and deleted_at (soft delete; a purge job hard-deletes later, FR-H2).

export const agentType = pgEnum("agent_type", ["claude", "chatgpt", "muse", "grok", "other"]);
export const factCategory = pgEnum("fact_category", ["preferences", "contacts", "family"]);
export const factSource = pgEnum("fact_source", ["manual", "import", "correction"]);
export const ruleStatus = pgEnum("rule_status", ["proposed", "active", "locked", "retired"]);
export const verdict = pgEnum("verdict", ["followed", "violated", "not_applicable", "uncertain"]);
export const scorer = pgEnum("scorer", ["jev", "claude", "user"]);
export const taskOutcome = pgEnum("task_outcome", ["completed", "failed", "needs_user"]);

const common = {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
};
const owned = { ...common, userId: uuid("user_id").notNull().references(() => users.id) };

export const users = pgTable("users", {
  ...common,
  email: text("email"),
  authSubject: text("auth_subject").notNull().unique(),
  adultAttestedAt: timestamp("adult_attested_at", { withTimezone: true }),
  // Which version of the Terms the person accepted, and when (run 9). A person who has not accepted the CURRENT version sees the
  // "One quick thing" step before anything else.
  termsVersion: text("terms_version"),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  plan: text("plan").notNull().default("free"),
  flags: jsonb("flags").notNull().default({}),
  // This person's data key, wrapped (encrypted) by the master key. Never the key itself (SEC-5).
  wrappedDataKey: text("wrapped_data_key"),
});

export const agentConnections = pgTable(
  "agent_connections",
  {
    ...owned,
    name: text("name").notNull(),
    // Null while the connection is unassigned; set when the user confirms it on the Agents screen (FR-A2).
    type: agentType("type"),
    // Only a hint for recognised addresses (Claude, ChatGPT); it grants nothing.
    suggestedType: agentType("suggested_type"),
    // Empty until the user confirms the connection (FR-A3).
    scopes: text("scopes").array().notNull().default(sql`ARRAY[]::text[]`),
    // Null while unassigned. Nothing beyond the status tool works until this is set.
    linkConfirmedAt: timestamp("link_confirmed_at", { withTimezone: true }),
    // An unassigned connection stops working after this time if the user does not confirm it.
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    needsName: boolean("needs_name").notNull().default(false),
    // Only for the demo agent and local testing (bearer path).
    tokenHash: text("token_hash"),
    tokenPrefix: text("token_prefix"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    oauthClientId: text("oauth_client_id"),
  },
  (t) => [
    unique("agent_connections_id_user").on(t.id, t.userId),
    unique("agent_connections_user_type").on(t.userId, t.type), // one connection per person per agent type (FR-A2)
    uniqueIndex("agent_connections_user_client").on(t.userId, t.oauthClientId).where(sql`${t.oauthClientId} IS NOT NULL`),
    uniqueIndex("agent_connections_token_prefix").on(t.tokenPrefix).where(sql`${t.tokenPrefix} IS NOT NULL`),
  ],
);

export const profileFacts = pgTable("profile_facts", {
  ...owned,
  category: factCategory("category").notNull(),
  tier: integer("tier").notNull(),
  key: text("key").notNull(),
  valueEncrypted: text("value_encrypted").notNull(),
  source: factSource("source").notNull(),
  lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }),
  // Open item 19. NULL = served by the category's permission (the default). A list (possibly empty) = served ONLY to these confirmed
  // connections, and only if they also hold the category's permission. Ids are this person's connection ids; stale ids match nobody.
  allowedAgentIds: uuid("allowed_agent_ids").array(),
});

export const tasks = pgTable(
  "tasks",
  {
    ...owned,
    agentConnectionId: uuid("agent_connection_id").notNull(),
    externalId: text("external_id").notNull(),
    // LEGACY readable summary. New rows leave it empty; it is read only until the backfill has encrypted every row, and a later
    // clean-up migration drops it (the project notes).
    summary: text("summary"),
    summaryEncrypted: text("summary_encrypted"),
    category: text("category").notNull(),
    detailsEncrypted: text("details_encrypted"),
    outcome: taskOutcome("outcome"),
    rulesConsulted: text("rules_consulted").array().notNull().default(sql`ARRAY[]::text[]`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("tasks_id_user").on(t.id, t.userId),
    // A task must belong to a connection owned by the same person.
    foreignKey({ columns: [t.agentConnectionId, t.userId], foreignColumns: [agentConnections.id, agentConnections.userId] }),
    unique("tasks_connection_external").on(t.agentConnectionId, t.externalId),
    index("tasks_user_occurred").on(t.userId, t.occurredAt),
  ],
);

export const feedback = pgTable(
  "feedback",
  {
    ...owned,
    taskId: uuid("task_id").notNull(),
    rating: text("rating").notNull(),
    reasonCodes: text("reason_codes").array().notNull().default(sql`ARRAY[]::text[]`),
    noteEncrypted: text("note_encrypted"),
    // "person" when they gave it on the Feed; "agent_reported" when an agent passed on what the person said (not their own words).
    source: text("source").notNull().default("person"),
    supersedesId: uuid("supersedes_id"),
  },
  (t) => [
    unique("feedback_id_user").on(t.id, t.userId),
    foreignKey({ columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }),
  ],
);

export const rules = pgTable(
  "rules",
  {
    ...owned,
    text: text("text").notNull(),
    category: text("category").notNull(),
    structured: jsonb("structured").notNull(),
    scope: text("scope").notNull().default("all"),
    status: ruleStatus("status").notNull(),
    version: integer("version").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    sourceFeedbackId: uuid("source_feedback_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by"), // always the user
  },
  (t) => [
    unique("rules_id_user").on(t.id, t.userId),
    index("rules_user_status_category").on(t.userId, t.status, t.category),
  ],
);

export const adherenceChecks = pgTable(
  "adherence_checks",
  {
    ...owned,
    taskId: uuid("task_id").notNull(),
    ruleId: uuid("rule_id").notNull(),
    verdict: verdict("verdict").notNull(),
    pApplies: numeric("p_applies"),
    pViolated: numeric("p_violated"),
    scorer: scorer("scorer").notNull(),
    modelVersion: text("model_version"),
    thresholdsJson: jsonb("thresholds_json"),
  },
  (t) => [
    foreignKey({ columns: [t.taskId, t.userId], foreignColumns: [tasks.id, tasks.userId] }),
    foreignKey({ columns: [t.ruleId, t.userId], foreignColumns: [rules.id, rules.userId] }),
    // One automatic check per task and rule, so scoring a task twice (a retry, two runs at once) can never double-count. The person's own answer is a separate row.
    uniqueIndex("adherence_checks_task_rule_auto").on(t.taskId, t.ruleId).where(sql`${t.scorer} <> 'user'`),
  ],
);

export const careSnapshots = pgTable("care_snapshots", {
  ...owned,
  date: text("date").notNull(),
  adherenceScore: numeric("adherence_score"),
  freshness: numeric("freshness"),
  tomatoStage: integer("tomato_stage"),
});

export const usageCounters = pgTable(
  "usage_counters",
  {
    ...owned,
    month: text("month").notNull(),
    proposals: integer("proposals").notNull().default(0),
    taskLogs: integer("task_logs").notNull().default(0),
    modelCostUsdByProvider: jsonb("model_cost_usd_by_provider").notNull().default({}),
  },
  (t) => [unique("usage_counters_user_month").on(t.userId, t.month)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    ...owned,
    agentConnectionId: uuid("agent_connection_id"),
    actor: text("actor").notNull(), // "agent" or "user"
    action: text("action").notNull(),
    categoriesRead: text("categories_read").array().notNull().default(sql`ARRAY[]::text[]`),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  // For the per-connection rate limit count and the newest-first audit view.
  (t) => [index("audit_log_user_connection_at").on(t.userId, t.agentConnectionId, t.at)],
);

export const consents = pgTable("consents", {
  ...owned,
  type: text("type").notNull(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const jobs = pgTable("jobs", {
  ...owned,
  type: text("type").notNull(),
  payloadRef: text("payload_ref"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Settings that belong to the whole service, not to one person (for example the switch that turns Claude calls off).
 * It has no user_id on purpose, so it is not in the tenant layer; only code in src/db reads and writes it.
 */
export const systemFlags = pgTable("system_flags", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Every table that belongs to a person, keyed by the name used in the data layer. */
export const ownedTables = {
  agentConnections, profileFacts, tasks, feedback, rules, adherenceChecks, careSnapshots, usageCounters, auditLog, consents, jobs,
} as const;
export type OwnedTableName = keyof typeof ownedTables;
