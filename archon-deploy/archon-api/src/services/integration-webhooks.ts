import crypto from "crypto"
import { db } from "../db/client.js"
import { integrationWebhooks, webhookDeliveries } from "../db/schema.js"
import { and, eq } from "drizzle-orm"

export interface IntegrationEventPayload {
    orgId: string
    event: string
    data: Record<string, unknown>
}

function signPayload(secret: string, payload: string): string {
    return crypto.createHmac("sha256", secret).update(payload).digest("hex")
}

/**
 * Deliver a single webhook with delivery tracking.
 * Returns the delivery record id.
 */
export async function deliverWebhook(
    hook: { id: string; orgId: string | null; url: string; secret: string | null },
    event: string,
    body: string,
    deliveryId: string
): Promise<{ success: boolean; statusCode?: number; error?: string; duration: number }> {
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Archon-Event": event,
        "X-Archon-Delivery": deliveryId,
    }
    if (hook.secret) {
        headers["X-Archon-Signature"] = signPayload(hook.secret, body)
    }

    const start = Date.now()
    try {
        const res = await fetch(hook.url, {
            method: "POST",
            headers,
            body,
            signal: AbortSignal.timeout(10_000), // 10s timeout
        })
        const duration = Date.now() - start
        const responseBody = await res.text().catch(() => "")

        await db.update(webhookDeliveries).set({
            status: res.ok ? "success" : "failed",
            statusCode: res.status,
            responseBody: responseBody.substring(0, 500),
            duration,
            lastAttemptAt: new Date(),
        }).where(eq(webhookDeliveries.id, deliveryId))

        if (!res.ok) {
            console.warn(`Webhook delivery to ${hook.url} returned HTTP ${res.status}`)
        }
        return { success: res.ok, statusCode: res.status, duration }
    } catch (err: any) {
        const duration = Date.now() - start
        await db.update(webhookDeliveries).set({
            status: "failed",
            error: err.message?.substring(0, 500),
            duration,
            lastAttemptAt: new Date(),
        }).where(eq(webhookDeliveries.id, deliveryId))
        console.warn(`Webhook delivery failed (${hook.url}): ${err.message}`)
        return { success: false, error: err.message, duration }
    }
}

export async function emitIntegrationEvent(payload: IntegrationEventPayload): Promise<void> {
    const hooks = await db.query.integrationWebhooks.findMany({
        where: and(
            eq(integrationWebhooks.orgId, payload.orgId),
            eq(integrationWebhooks.isActive, true),
        ),
    })

    if (hooks.length === 0) return

    const body = JSON.stringify({
        event: payload.event,
        timestamp: new Date().toISOString(),
        data: payload.data,
    })

    for (const hook of hooks) {
        const subscribed = Array.isArray(hook.events) ? hook.events as string[] : []
        if (subscribed.length > 0 && !subscribed.includes(payload.event)) continue

        // Create delivery record (pending)
        const deliveryId = crypto.randomUUID()
        await db.insert(webhookDeliveries).values({
            id: deliveryId,
            webhookId: hook.id,
            orgId: hook.orgId,
            event: payload.event,
            url: hook.url,
            status: "pending",
        })

        await deliverWebhook(hook, payload.event, body, deliveryId)
    }
}
