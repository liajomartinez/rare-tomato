CREATE TYPE "public"."agent_type" AS ENUM('claude', 'chatgpt', 'muse', 'grok', 'other');--> statement-breakpoint
CREATE TYPE "public"."fact_category" AS ENUM('preferences', 'contacts', 'family');--> statement-breakpoint
CREATE TYPE "public"."fact_source" AS ENUM('manual', 'import', 'correction');--> statement-breakpoint
CREATE TYPE "public"."rule_status" AS ENUM('proposed', 'active', 'locked', 'retired');--> statement-breakpoint
CREATE TYPE "public"."scorer" AS ENUM('jev', 'claude', 'user');--> statement-breakpoint
CREATE TYPE "public"."task_outcome" AS ENUM('completed', 'failed', 'needs_user');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('followed', 'violated', 'not_applicable', 'uncertain');--> statement-breakpoint
CREATE TABLE "adherence_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"verdict" "verdict" NOT NULL,
	"p_applies" numeric,
	"p_violated" numeric,
	"scorer" "scorer" NOT NULL,
	"model_version" text,
	"thresholds_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "agent_type" NOT NULL,
	"scopes" text[] DEFAULT ARRAY['profile:basic','rules:read','tasks:write']::text[] NOT NULL,
	"link_confirmed_at" timestamp with time zone,
	"needs_name" boolean DEFAULT false NOT NULL,
	"token_hash" text,
	"token_prefix" text,
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"oauth_client_id" text,
	CONSTRAINT "agent_connections_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "agent_connections_user_type" UNIQUE("user_id","type")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"agent_connection_id" uuid,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"categories_read" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"date" text NOT NULL,
	"adherence_score" numeric,
	"freshness" numeric,
	"tomato_stage" integer
);
--> statement-breakpoint
CREATE TABLE "consents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"rating" text NOT NULL,
	"reason_codes" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"note_encrypted" text,
	"supersedes_id" uuid,
	CONSTRAINT "feedback_id_user" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload_ref" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"category" "fact_category" NOT NULL,
	"tier" integer NOT NULL,
	"key" text NOT NULL,
	"value_encrypted" text NOT NULL,
	"source" "fact_source" NOT NULL,
	"last_reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	"structured" jsonb NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"status" "rule_status" NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"source_feedback_id" uuid,
	"approved_at" timestamp with time zone,
	"approved_by" uuid,
	CONSTRAINT "rules_id_user" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"agent_connection_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"summary" text NOT NULL,
	"category" text NOT NULL,
	"details_encrypted" text,
	"outcome" "task_outcome",
	"rules_consulted" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_id_user" UNIQUE("id","user_id"),
	CONSTRAINT "tasks_connection_external" UNIQUE("agent_connection_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"user_id" uuid NOT NULL,
	"month" text NOT NULL,
	"proposals" integer DEFAULT 0 NOT NULL,
	"task_logs" integer DEFAULT 0 NOT NULL,
	"model_cost_usd_by_provider" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "usage_counters_user_month" UNIQUE("user_id","month")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"email" text,
	"auth_subject" text NOT NULL,
	"adult_attested_at" timestamp with time zone,
	"plan" text DEFAULT 'free' NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "users_auth_subject_unique" UNIQUE("auth_subject")
);
--> statement-breakpoint
ALTER TABLE "adherence_checks" ADD CONSTRAINT "adherence_checks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adherence_checks" ADD CONSTRAINT "adherence_checks_task_id_user_id_tasks_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adherence_checks" ADD CONSTRAINT "adherence_checks_rule_id_user_id_rules_id_user_id_fk" FOREIGN KEY ("rule_id","user_id") REFERENCES "public"."rules"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_connections" ADD CONSTRAINT "agent_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_snapshots" ADD CONSTRAINT "care_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_task_id_user_id_tasks_id_user_id_fk" FOREIGN KEY ("task_id","user_id") REFERENCES "public"."tasks"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_facts" ADD CONSTRAINT "profile_facts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_agent_connection_id_user_id_agent_connections_id_user_id_fk" FOREIGN KEY ("agent_connection_id","user_id") REFERENCES "public"."agent_connections"("id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_connections_user_client" ON "agent_connections" USING btree ("user_id","oauth_client_id") WHERE "agent_connections"."oauth_client_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "agent_connections_token_prefix" ON "agent_connections" USING btree ("token_prefix") WHERE "agent_connections"."token_prefix" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "rules_user_status_category" ON "rules" USING btree ("user_id","status","category");--> statement-breakpoint
CREATE INDEX "tasks_user_occurred" ON "tasks" USING btree ("user_id","occurred_at");