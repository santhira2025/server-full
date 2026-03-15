CREATE TABLE "developer_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"github_login" text NOT NULL,
	"skill_level" text DEFAULT 'mid',
	"weak_areas" jsonb DEFAULT '{}'::jsonb,
	"strong_areas" jsonb DEFAULT '{}'::jsonb,
	"total_reviews" integer DEFAULT 0,
	"total_issues_found" integer DEFAULT 0,
	"repeated_mistakes" integer DEFAULT 0,
	"security_score" integer DEFAULT 50,
	"last_reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "learning_events" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text,
	"github_login" text NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer,
	"mistake_type" text NOT NULL,
	"severity" text DEFAULT 'medium',
	"was_repeated" boolean DEFAULT false,
	"file_path" text,
	"line_number" integer,
	"description" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "developer_profiles" ADD CONSTRAINT "developer_profiles_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_events" ADD CONSTRAINT "learning_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;