ALTER TABLE "tasks" ALTER COLUMN "summary" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "summary_encrypted" text;