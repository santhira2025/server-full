-- World Class Features: Feedback Learning + Analytics
CREATE TABLE IF NOT EXISTS "review_learnings" (
    "id" text PRIMARY KEY NOT NULL,
    "org_id" text REFERENCES "organizations"("id"),
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

CREATE TABLE IF NOT EXISTS "analytics_events" (
    "id" text PRIMARY KEY NOT NULL,
    "org_id" text REFERENCES "organizations"("id"),
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
    "metadata" jsonb DEFAULT '{}',
    "created_at" timestamp DEFAULT now()
);

-- Add head_sha column to review_results for incremental diff reviews
ALTER TABLE "review_results" ADD COLUMN IF NOT EXISTS "head_sha" text;

CREATE INDEX IF NOT EXISTS "idx_review_learnings_org_repo" ON "review_learnings" ("org_id", "repo");
CREATE INDEX IF NOT EXISTS "idx_analytics_events_org" ON "analytics_events" ("org_id", "created_at");
