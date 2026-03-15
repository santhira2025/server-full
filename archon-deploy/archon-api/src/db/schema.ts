import { pgTable, text, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core"

export const organizations = pgTable("organizations", {
    id: text("id").primaryKey(),                    // GitHub org/user ID
    githubLogin: text("github_login").notNull(),
    installationId: integer("installation_id"),
    plan: text("plan").default("free"),             // free, pro, team, enterprise
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const users = pgTable("users", {
    id: text("id").primaryKey(),                    // GitHub user ID
    githubLogin: text("github_login").notNull(),
    email: text("email"),
    orgId: text("org_id").references(() => organizations.id),
    role: text("role").default("member"),           // owner, admin, member
    createdAt: timestamp("created_at").defaultNow(),
})

export const usageRecords = pgTable("usage_records", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    userId: text("user_id").references(() => users.id),
    repo: text("repo").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    cost: integer("cost_microcents").default(0),    // Cost in microcents (1/10000 cent)
    createdAt: timestamp("created_at").defaultNow(),
})

// Settings shape: {
//   autoReview: boolean,           // auto-review on PR open/sync
//   autoReviewFocus: string[],     // ['security', 'bugs', 'style', 'performance']
//   model: string,                 // override model for this repo
//   securityScan: boolean,         // auto security scan
//   autoTriage: boolean,           // auto-triage new issues
// }
export const repos = pgTable("repos", {
    id: text("id").primaryKey(),                    // GitHub repo ID
    orgId: text("org_id").references(() => organizations.id),
    fullName: text("full_name").notNull(),          // owner/repo
    isActive: boolean("is_active").default(true),
    settings: jsonb("settings").default({}),        // See settings shape above
    createdAt: timestamp("created_at").defaultNow(),
})

export const reviewResults = pgTable("review_results", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),                          // owner/repo
    issueNumber: integer("issue_number").notNull(),
    actionType: text("action_type").notNull(),             // review, resolve, security, explain
    verdict: text("verdict"),                               // APPROVE, REQUEST_CHANGES, COMMENT
    summary: text("summary"),
    inlineCommentsCount: integer("inline_comments_count").default(0),
    securityIssuesCount: integer("security_issues_count").default(0),
    filesReviewed: integer("files_reviewed").default(0),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    resultData: jsonb("result_data"),                      // full JSON result
    status: text("status").default("pending"),             // pending, running, completed, failed
    headSha: text("head_sha"),                             // SHA of PR head when review was completed
    createdAt: timestamp("created_at").defaultNow(),
    completedAt: timestamp("completed_at"),
})

// ── Archon Coach ─────────────────────────────────────────────────

export const developerProfiles = pgTable("developer_profiles", {
    id: text("id").primaryKey(),                    // orgId:githubLogin
    orgId: text("org_id").references(() => organizations.id),
    githubLogin: text("github_login").notNull(),
    skillLevel: text("skill_level").default("mid"), // junior, mid, senior (auto-detected)
    weakAreas: jsonb("weak_areas").default({}),     // { "sql_injection": 3, "missing_error_handling": 5 }
    strongAreas: jsonb("strong_areas").default({}), // { "clean_architecture": 2 }
    totalReviews: integer("total_reviews").default(0),
    totalIssuesFound: integer("total_issues_found").default(0),
    repeatedMistakes: integer("repeated_mistakes").default(0),
    securityScore: integer("security_score").default(50),  // 0-100, starts neutral
    lastReviewedAt: timestamp("last_reviewed_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const learningEvents = pgTable("learning_events", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    githubLogin: text("github_login").notNull(),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number"),
    mistakeType: text("mistake_type").notNull(),    // e.g., "sql_injection", "missing_error_handling"
    severity: text("severity").default("medium"),   // critical, high, medium, low
    wasRepeated: boolean("was_repeated").default(false),
    filePath: text("file_path"),
    lineNumber: integer("line_number"),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow(),
})

export const eventLogs = pgTable("event_logs", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    eventType: text("event_type").notNull(),               // pr_review, issue_resolve, auto_review, etc.
    issueNumber: integer("issue_number"),
    status: text("status").default("received"),            // received, processing, completed, failed
    payload: jsonb("payload"),                             // sanitized event metadata
    message: text("message"),
    createdAt: timestamp("created_at").defaultNow(),
})

export const prRiskScores = pgTable("pr_risk_scores", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    prNumber: integer("pr_number").notNull(),
    author: text("author").notNull(),
    riskScore: integer("risk_score").notNull(),
    riskLevel: text("risk_level").notNull(),               // low, medium, high
    reasons: jsonb("reasons").default([]),
    recommendedReviewer: text("recommended_reviewer"),
    createdAt: timestamp("created_at").defaultNow(),
})

export const releaseNotes = pgTable("release_notes", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    tag: text("tag").notNull(),
    fromTag: text("from_tag"),
    toTag: text("to_tag"),
    notes: text("notes").notNull(),
    prCount: integer("pr_count").default(0),
    createdAt: timestamp("created_at").defaultNow(),
})

export const reviewerPreferences = pgTable("reviewer_preferences", {
    id: text("id").primaryKey(),                    // orgId:category
    orgId: text("org_id").references(() => organizations.id),
    category: text("category").notNull(),           // naming, patterns, testing, style, error_handling
    preference: text("preference").notNull(),
    source: text("source").default("human_review"),
    examplesCount: integer("examples_count").default(1),
    lastSeenAt: timestamp("last_seen_at").defaultNow(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const tasks = pgTable("tasks", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    issueNumber: integer("issue_number"),
    taskType: text("task_type").notNull(),              // review, resolve, security, explain, analyze, fix, all, label_trigger
    status: text("status").default("queued"),           // queued, processing, completed, failed
    triggerType: text("trigger_type").default("manual"),// manual (comment), auto (auto-review), label
    triggeredBy: text("triggered_by"),
    summary: text("summary"),
    error: text("error"),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow(),
})

// ── Feedback Learning (CodeRabbit-inspired) ─────────────────────────

export const reviewLearnings = pgTable("review_learnings", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    feedbackType: text("feedback_type").notNull(),   // positive, negative, correction
    originalComment: text("original_comment"),
    userFeedback: text("user_feedback"),
    filePattern: text("file_pattern"),                // glob pattern e.g. "src/routes/*.ts"
    language: text("language"),
    category: text("category"),                       // bug, style, security, performance
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
})

// ── Review Analytics ─────────────────────────────────────────────────

export const analyticsEvents = pgTable("analytics_events", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    repo: text("repo").notNull(),
    eventType: text("event_type").notNull(),          // review, security, resolve, tests, suggestion_accepted, suggestion_rejected
    prNumber: integer("pr_number"),
    author: text("author"),
    verdict: text("verdict"),
    inlineCommentsCount: integer("inline_comments_count").default(0),
    securityIssuesCount: integer("security_issues_count").default(0),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),
    complexityDelta: integer("complexity_delta").default(0),
    testCoverageGaps: integer("test_coverage_gaps").default(0),
    selfCheckFiltered: integer("self_check_filtered").default(0),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at").defaultNow(),
})

export const integrationWebhooks = pgTable("integration_webhooks", {
    id: text("id").primaryKey(),
    orgId: text("org_id").references(() => organizations.id),
    url: text("url").notNull(),
    events: jsonb("events").default([]),
    secret: text("secret"),
    isActive: boolean("is_active").default(true),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
})

export const webhookDeliveries = pgTable("webhook_deliveries", {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id").references(() => integrationWebhooks.id),
    orgId: text("org_id").references(() => organizations.id),
    event: text("event").notNull().default("outbound"),
    url: text("url").notNull(),
    payload: jsonb("payload"),                              // JSON body sent (for retry)
    status: text("status").notNull().default("pending"),   // pending, delivered, failed, dead
    statusCode: integer("status_code"),
    responseBody: text("response_body"),
    error: text("error"),                                   // alias for lastError (legacy)
    lastError: text("last_error"),                          // latest error message
    duration: integer("duration"),                          // ms
    attempts: integer("attempts").default(1),               // legacy column (kept for compatibility)
    attemptCount: integer("attempt_count").default(0),      // number of delivery attempts
    nextRetryAt: timestamp("next_retry_at"),               // when to retry (null = no retry)
    deliveredAt: timestamp("delivered_at"),                // when successfully delivered
    context: text("context"),                              // human-readable context (e.g. "review:owner/repo#42")
    createdAt: timestamp("created_at").defaultNow(),
    lastAttemptAt: timestamp("last_attempt_at"),
})
