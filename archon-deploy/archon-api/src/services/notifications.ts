/**
 * Notification service — delivers review completion alerts.
 *
 * Supports:
 *   SLACK_WEBHOOK_URL        — Slack incoming webhook (also works with Discord)
 *   NOTIFICATION_WEBHOOK_URL — Generic POST webhook (your own endpoint)
 *
 * Failed deliveries are logged to webhookDeliveries for retry by the scheduler.
 */
import { logger } from "../lib/logger.js"
import { db } from "../db/client.js"
import { webhookDeliveries } from "../db/schema.js"
import crypto from "crypto"

export interface ReviewNotification {
    repo: string
    prNumber: number
    verdict: string
    summary: string
    inlineComments: number
    securityIssues: number
    actionType: string
    prUrl?: string
}

/**
 * Attempt to POST JSON to a URL. On failure, log to webhookDeliveries so
 * the scheduler can retry. Returns true if delivery succeeded.
 */
async function postJson(url: string, body: unknown, context?: string): Promise<boolean> {
    try {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(5_000),
        })
        if (!res.ok) {
            logger.warn({ url, status: res.status }, "Notification webhook returned non-OK status")
            await logFailedDelivery(url, body, `HTTP ${res.status}`, context)
            return false
        }
        return true
    } catch (err: any) {
        logger.warn({ err, url }, "Notification delivery failed")
        await logFailedDelivery(url, body, err.message || "network error", context)
        return false
    }
}

/**
 * Record a failed webhook delivery for scheduler retry.
 */
async function logFailedDelivery(url: string, payload: unknown, errorMsg: string, context?: string): Promise<void> {
    try {
        const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000) // retry in 5 minutes
        await db.insert(webhookDeliveries).values({
            id: crypto.randomUUID(),
            url,
            payload: payload as any,
            status: "failed",
            attemptCount: 1,
            lastError: errorMsg.substring(0, 500),
            nextRetryAt,
            context: context || null,
        })
    } catch {
        // webhookDeliveries table may not exist yet (migration not run) — non-fatal
    }
}

function verdictEmoji(verdict: string): string {
    switch (verdict?.toUpperCase()) {
        case "APPROVE": return "✅"
        case "REQUEST_CHANGES": return "🔴"
        default: return "💬"
    }
}

function verdictColor(verdict: string): string {
    switch (verdict?.toUpperCase()) {
        case "APPROVE": return "#36A64F"
        case "REQUEST_CHANGES": return "#FF0000"
        default: return "#808080"
    }
}

export async function notifyReviewComplete(n: ReviewNotification): Promise<void> {
    const slackUrl = process.env.SLACK_WEBHOOK_URL
    const genericUrl = process.env.NOTIFICATION_WEBHOOK_URL

    if (!slackUrl && !genericUrl) return

    const emoji = verdictEmoji(n.verdict)
    const verdictLabel =
        n.verdict === "APPROVE"
            ? "Approved ✅"
            : n.verdict === "REQUEST_CHANGES"
                ? "Changes Requested 🔴"
                : "Reviewed 💬"

    const context = `review:${n.repo}#${n.prNumber}`

    if (slackUrl) {
        const slackBody = {
            text: `${emoji} *Archon Review*: \`${n.repo}\` #${n.prNumber}`,
            attachments: [
                {
                    color: verdictColor(n.verdict),
                    fields: [
                        { title: "Verdict", value: verdictLabel, short: true },
                        { title: "Action", value: n.actionType, short: true },
                        { title: "Inline Comments", value: String(n.inlineComments), short: true },
                        { title: "Security Issues", value: String(n.securityIssues), short: true },
                        ...(n.summary
                            ? [{ title: "Summary", value: n.summary.substring(0, 400), short: false }]
                            : []),
                    ],
                    ...(n.prUrl ? { title: `View PR #${n.prNumber}`, title_link: n.prUrl } : {}),
                    footer: "Archon AI Code Review",
                    ts: Math.floor(Date.now() / 1000),
                },
            ],
        }
        await postJson(slackUrl, slackBody, context)
    }

    if (genericUrl) {
        await postJson(genericUrl, {
            event: "review_complete",
            repo: n.repo,
            prNumber: n.prNumber,
            verdict: n.verdict,
            inlineComments: n.inlineComments,
            securityIssues: n.securityIssues,
            actionType: n.actionType,
            summary: n.summary?.substring(0, 500),
            prUrl: n.prUrl,
            timestamp: new Date().toISOString(),
        }, context)
    }
}

export async function notifySecurityAlert(opts: {
    repo: string
    level: string
    score: number
    topFindings: string[]
    reportPath?: string
}): Promise<void> {
    const slackUrl = process.env.SLACK_WEBHOOK_URL
    if (!slackUrl) return

    const color = opts.score >= 70 ? "#FF0000" : opts.score >= 40 ? "#FFA500" : "#36A64F"

    await postJson(slackUrl, {
        text: `🔒 *Archon Security Alert*: \`${opts.repo}\` — Risk Level: *${opts.level}* (score: ${opts.score})`,
        attachments: [
            {
                color,
                fields: [
                    { title: "Risk Level", value: opts.level, short: true },
                    { title: "Score", value: String(opts.score), short: true },
                    ...(opts.topFindings.length > 0
                        ? [{ title: "Top Findings", value: opts.topFindings.slice(0, 3).join("\n"), short: false }]
                        : []),
                    ...(opts.reportPath
                        ? [{ title: "Report", value: opts.reportPath, short: false }]
                        : []),
                ],
                footer: "Archon Security Scanner",
                ts: Math.floor(Date.now() / 1000),
            },
        ],
    }, `security-alert:${opts.repo}`)
}
