ALTER TABLE "agent_connections" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_connections" ALTER COLUMN "scopes" SET DEFAULT ARRAY[]::text[];--> statement-breakpoint
ALTER TABLE "agent_connections" ADD COLUMN "suggested_type" "agent_type";--> statement-breakpoint
ALTER TABLE "agent_connections" ADD COLUMN "expires_at" timestamp with time zone;