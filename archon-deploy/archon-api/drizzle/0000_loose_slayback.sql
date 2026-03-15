CREATE TABLE "event_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"event_type" text NOT NULL,
	"issue_number" integer,
	"status" text DEFAULT 'received',
	"payload" jsonb,
	"message" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"github_login" text NOT NULL,
	"installation_id" integer,
	"plan" text DEFAULT 'free',
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "repos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"full_name" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "review_results" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"repo" text NOT NULL,
	"issue_number" integer NOT NULL,
	"action_type" text NOT NULL,
	"verdict" text,
	"summary" text,
	"inline_comments_count" integer DEFAULT 0,
	"security_issues_count" integer DEFAULT 0,
	"files_reviewed" integer DEFAULT 0,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"result_data" jsonb,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"user_id" text,
	"repo" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0,
	"output_tokens" integer DEFAULT 0,
	"cost_microcents" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"github_login" text NOT NULL,
	"email" text,
	"org_id" text,
	"role" text DEFAULT 'member',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_logs" ADD CONSTRAINT "event_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_results" ADD CONSTRAINT "review_results_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;