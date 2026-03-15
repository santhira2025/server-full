/**
 * Scheduled background tasks using node-cron.
 *
 * Enable by setting SCHEDULER_ENABLED=true in your .env file.
 *
 * Current schedules:
 *   - Weekly security reports: every Monday at 09:00 UTC
 *   - Failed webhook retry:    every 5 minutes (if SCHEDULER_ENABLED=true)
 */
import cron from "node-cron"
import { db } from "../db/client.js"
import { organizations, repos, webhookDeliveries } from "../db/schema.js"
import { eq, and, lte, lt } from "drizzle-orm"
import { runReviewEngine } from "./review-engine.js"
import { routeToModel } from "./ai-proxy.js"
import { logger } from "../lib/logger.js"
import { alertError } from "../lib/alerting.js"

// ── Weekly security reports ──────────────────────────────────────────

async function runWeeklySecurityReports(): Promise<void> {
    logger.info("Scheduler: Starting weekly security reports")

    let orgs: Array<{ id: string; githubLogin: string; installationId: number | null }> = []
    try {
        orgs = await db.query.organizations.findMany()
    } catch (err) {
        alertError("Scheduler: failed to fetch orgs for weekly reports", err)
        return
    }

    let success = 0
    let failed = 0

    for (const org of orgs) {
        if (!org.installationId) continue

        try {
            const activeRepos = await db.query.repos.findMany({
                where: and(eq(repos.orgId, org.id), eq(repos.isActive, true)),
                limit: 1,
            })
            if (activeRepos.length === 0) continue

            const repo = activeRepos[0]
            const { provider, modelId, apiKey } = routeToModel("free")

            logger.info({ org: org.githubLogin, repo: repo.fullName }, "Scheduler: running weekly security report")

            await runReviewEngine({
                installationId: org.installationId,
                orgId: org.id,
                repoFullName: repo.fullName,
                issueNumber: 0,
                actionType: "report",
                model: modelId,
                provider,
                apiKey,
                requestedBy: "archon-scheduler",
            })
            success++
        } catch (err) {
            failed++
            logger.error({ err, org: org.githubLogin }, "Scheduler: weekly report failed for org")
        }
    }

    logger.info({ success, failed, total: orgs.length }, "Scheduler: weekly security reports complete")
}

// ── Failed webhook retry ─────────────────────────────────────────────
// Retries outbound integration webhooks (Slack, generic) that failed delivery.
// Uses exponential back-off: retries at 5m, 15m, 1h intervals (max 3 attempts).

const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAYS_MS = [5 * 60 * 1000, 15 * 60 * 1000, 60 * 60 * 1000]

async function retryFailedWebhooks(): Promise<void> {
    let pending: any[] = []
    try {
        // Find deliveries that failed and are due for retry
        const now = new Date()
        pending = await db.query.webhookDeliveries.findMany({
            where: and(
                eq(webhookDeliveries.status, "failed"),
                lte(webhookDeliveries.nextRetryAt, now),
                lt(webhookDeliveries.attemptCount, MAX_RETRY_ATTEMPTS),
            ),
            limit: 20,
        })
    } catch {
        // webhookDeliveries table may not exist on older schemas — non-fatal
        return
    }

    if (pending.length === 0) return
    logger.info({ count: pending.length }, "Scheduler: retrying failed webhook deliveries")

    for (const delivery of pending) {
        try {
            const payload = (delivery.payload as Record<string, unknown>) || {}
            const res = await fetch(delivery.url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(8_000),
            })

            const attempt = (delivery.attemptCount || 0) + 1
            if (res.ok) {
                await db.update(webhookDeliveries)
                    .set({ status: "delivered", attemptCount: attempt, deliveredAt: new Date() })
                    .where(eq(webhookDeliveries.id, delivery.id))
                logger.info({ id: delivery.id, attempt }, "Scheduler: webhook delivery succeeded on retry")
            } else {
                const nextDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
                const nextRetry = attempt >= MAX_RETRY_ATTEMPTS ? null : new Date(Date.now() + nextDelay)
                await db.update(webhookDeliveries)
                    .set({
                        attemptCount: attempt,
                        status: attempt >= MAX_RETRY_ATTEMPTS ? "dead" : "failed",
                        nextRetryAt: nextRetry,
                        lastError: `HTTP ${res.status}`,
                    })
                    .where(eq(webhookDeliveries.id, delivery.id))
            }
        } catch (err: any) {
            const attempt = (delivery.attemptCount || 0) + 1
            const nextDelay = RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
            const nextRetry = attempt >= MAX_RETRY_ATTEMPTS ? null : new Date(Date.now() + nextDelay)
            try {
                await db.update(webhookDeliveries)
                    .set({
                        attemptCount: attempt,
                        status: attempt >= MAX_RETRY_ATTEMPTS ? "dead" : "failed",
                        nextRetryAt: nextRetry,
                        lastError: err.message?.substring(0, 500) || "unknown error",
                    })
                    .where(eq(webhookDeliveries.id, delivery.id))
            } catch { /* non-fatal */ }
        }
    }
}

// ── Scheduler Entry Point ────────────────────────────────────────────

export function startScheduler(): void {
    if (process.env.SCHEDULER_ENABLED !== "true") {
        logger.info("Scheduler: disabled (set SCHEDULER_ENABLED=true to enable weekly reports)")
        return
    }

    // Weekly security reports — every Monday at 09:00 UTC
    cron.schedule(
        "0 9 * * 1",
        () => { void runWeeklySecurityReports() },
        { timezone: "UTC" },
    )

    // Webhook retry — every 5 minutes
    cron.schedule(
        "*/5 * * * *",
        () => { void retryFailedWebhooks() },
        { timezone: "UTC" },
    )

    logger.info("Scheduler: started — weekly security reports every Monday 09:00 UTC, webhook retries every 5 min")
}
