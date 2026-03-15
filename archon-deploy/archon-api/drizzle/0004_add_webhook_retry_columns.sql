CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"event_type" text NOT NULL,
	"pr_number" integer,
	"author" text,
	"verdict" text,
	"inline_comments_count" integer DEFAULT 0,
	"security_issues_count" integer DEFAULT 0,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"complexity_delta" integer DEFAULT 0,
	"test_coverage_gaps" integer DEFAULT 0,
	"self_check_filtered" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "integration_webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"url" text NOT NULL,
	"events" jsonb DEFAULT '[]'::jsonb,
	"secret" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "pr_risk_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"author" text NOT NULL,
	"risk_score" integer NOT NULL,
	"risk_level" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb,
	"recommended_reviewer" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "release_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"tag" text NOT NULL,
	"from_tag" text,
	"to_tag" text,
	"notes" text NOT NULL,
	"pr_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_learnings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"feedback_type" text NOT NULL,
	"original_comment" text,
	"user_feedback" text,
	"file_pattern" text,
	"language" text,
	"category" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reviewer_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"category" text NOT NULL,
	"preference" text NOT NULL,
	"source" text DEFAULT 'human_review',
	"examples_count" integer DEFAULT 1,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"issue_number" integer,
	"task_type" text NOT NULL,
	"status" text DEFAULT 'queued',
	"trigger_type" text DEFAULT 'manual',
	"triggered_by" text,
	"summary" text,
	"error" text,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"webhook_id" text,
	"org_id" text,
	"event" text DEFAULT 'outbound' NOT NULL,
	"url" text NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"status_code" integer,
	"response_body" text,
	"error" text,
	"last_error" text,
	"duration" integer,
	"attempts" integer DEFAULT 1,
	"attempt_count" integer DEFAULT 0,
	"next_retry_at" timestamp,
	"delivered_at" timestamp,
	"context" text,
	"created_at" timestamp DEFAULT now(),
	"last_attempt_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "review_results" ADD COLUMN "head_sha" text;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_webhooks" ADD CONSTRAINT "integration_webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pr_risk_scores" ADD CONSTRAINT "pr_risk_scores_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_learnings" ADD CONSTRAINT "review_learnings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_preferences" ADD CONSTRAINT "reviewer_preferences_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhook_id_integration_webhooks_id_fk" FOREIGN KEY ("webhook_id") REFERENCES "public"."integration_webhooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;