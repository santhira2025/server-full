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
ALTER TABLE "integration_webhooks" ADD CONSTRAINT "integration_webhooks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pr_risk_scores" ADD CONSTRAINT "pr_risk_scores_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "release_notes" ADD CONSTRAINT "release_notes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
