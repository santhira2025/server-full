-- Webhook Delivery Tracking
CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
    "id" text PRIMARY KEY NOT NULL,
    "webhook_id" text REFERENCES "integration_webhooks"("id"),
    "org_id" text REFERENCES "organizations"("id"),
    "event" text NOT NULL,
    "url" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending',
    "status_code" integer,
    "response_body" text,
    "error" text,
    "duration" integer,
    "attempts" integer DEFAULT 1,
    "created_at" timestamp DEFAULT now(),
    "last_attempt_at" timestamp
);

CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_webhook" ON "webhook_deliveries" ("webhook_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_webhook_deliveries_org" ON "webhook_deliveries" ("org_id", "created_at" DESC);
