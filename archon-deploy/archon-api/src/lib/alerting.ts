/**
 * Error alerting service — sends structured alerts via webhook.
 *
 * Supports Slack-compatible webhooks (Slack, Discord, Teams).
 * All operations are fire-and-forget and never throw to callers.
 *
 * Config via environment variables:
 *   ALERT_WEBHOOK_URL — Slack-compatible incoming webhook URL
 *   ALERT_MIN_LEVEL   — "error" (default) or "warn" (send on warnings too)
 */
import { logger } from "./logger.js"

type AlertLevel = "error" | "warn"

interface AlertPayload {
    level: AlertLevel
    service: string
    message: string
    error?: string
    stack?: string
    context?: Record<string, unknown>
    timestamp: string
}

async function sendWebhook(payload: AlertPayload): Promise<void> {
    const url = process.env.ALERT_WEBHOOK_URL
    if (!url) return

    const minLevel = process.env.ALERT_MIN_LEVEL || "error"
    if (minLevel === "error" && payload.level === "warn") return

    try {
        const slackBody = {
            text: `[${payload.level.toUpperCase()}] *${payload.service}*: ${payload.message}`,
            attachments: [
                {
                    color: payload.level === "error" ? "#FF0000" : "#FFA500",
                    fields: [
                        ...(payload.error
                            ? [{ title: "Error", value: payload.error, short: false }]
                            : []),
                        ...(payload.stack
                            ? [{ title: "Stack (top 5 frames)", value: `\`\`\`${payload.stack}\`\`\``, short: false }]
                            : []),
                        ...(payload.context
                            ? Object.entries(payload.context).slice(0, 5).map(([k, v]) => ({
                                  title: k,
                                  value: String(v).substring(0, 200),
                                  short: true,
                              }))
                            : []),
                    ],
                    footer: `archon-api | ${payload.timestamp}`,
                },
            ],
        }

        await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(slackBody),
            signal: AbortSignal.timeout(5_000),
        })
    } catch (err) {
        // Never crash over alerting failure
        logger.warn({ err }, "Alert webhook delivery failed")
    }
}

/** Log + alert on unhandled server errors (5xx). */
export function alertError(
    message: string,
    err?: unknown,
    context?: Record<string, unknown>,
): void {
    const error = err instanceof Error ? err : undefined
    const payload: AlertPayload = {
        level: "error",
        service: "archon-api",
        message,
        error: error?.message,
        stack: error?.stack?.split("\n").slice(0, 5).join("\n"),
        context,
        timestamp: new Date().toISOString(),
    }
    void sendWebhook(payload)
}

/** Log + alert on non-fatal warnings worth monitoring. */
export function alertWarn(message: string, context?: Record<string, unknown>): void {
    const payload: AlertPayload = {
        level: "warn",
        service: "archon-api",
        message,
        context,
        timestamp: new Date().toISOString(),
    }
    void sendWebhook(payload)
}
