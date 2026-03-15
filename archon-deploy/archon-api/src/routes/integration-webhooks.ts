import { Hono } from "hono"
import crypto from "crypto"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../db/client.js"
import { integrationWebhooks, webhookDeliveries } from "../db/schema.js"
import { hasMinimumRole, requireAuthUser, type AuthUser } from "../lib/authz.js"
import { deliverWebhook } from "../services/integration-webhooks.js"

const webhooks = new Hono<{ Variables: { authUser: AuthUser } }>()

webhooks.use("*", async (c, next) => {
    const user = await requireAuthUser(c)
    if (!user) return c.json({ error: "Unauthorized" }, 401)
    c.set("authUser", user)
    await next()
})

// ── List webhooks ────────────────────────────────────────────────────
webhooks.get("/", async (c) => {
    const authUser = c.get("authUser") as { orgId: string }
    const rows = await db.query.integrationWebhooks.findMany({
        where: eq(integrationWebhooks.orgId, authUser.orgId),
    })
    return c.json({ webhooks: rows })
})

// ── Create webhook ───────────────────────────────────────────────────
webhooks.post("/", async (c) => {
    const authUser = c.get("authUser") as { orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const body = await c.req.json()
    const url = String(body.url || "").trim()
    if (!/^https?:\/\//i.test(url)) {
        return c.json({ error: "A valid webhook URL is required" }, 400)
    }

    const events = Array.isArray(body.events) ? body.events.map((e: unknown) => String(e)) : []
    const secret = body.secret ? String(body.secret) : null

    const id = crypto.randomUUID()
    await db.insert(integrationWebhooks).values({
        id,
        orgId: authUser.orgId,
        url,
        events,
        secret,
        isActive: true,
        updatedAt: new Date(),
    })

    const row = await db.query.integrationWebhooks.findFirst({
        where: eq(integrationWebhooks.id, id),
    })
    return c.json({ webhook: row })
})

// ── Update webhook ───────────────────────────────────────────────────
webhooks.put("/:id", async (c) => {
    const authUser = c.get("authUser") as { orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const id = c.req.param("id")
    const body = await c.req.json()

    const existing = await db.query.integrationWebhooks.findFirst({
        where: and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)),
    })
    if (!existing) return c.json({ error: "Not found" }, 404)

    const updates: Partial<typeof integrationWebhooks.$inferInsert> = { updatedAt: new Date() }

    if (body.url !== undefined) {
        const url = String(body.url).trim()
        if (!/^https?:\/\//i.test(url)) return c.json({ error: "Invalid URL" }, 400)
        updates.url = url
    }
    if (body.events !== undefined) {
        updates.events = Array.isArray(body.events) ? body.events.map(String) : []
    }
    if (body.secret !== undefined) {
        updates.secret = body.secret ? String(body.secret) : null
    }
    if (body.isActive !== undefined) {
        updates.isActive = Boolean(body.isActive)
    }

    await db.update(integrationWebhooks).set(updates)
        .where(and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)))

    const row = await db.query.integrationWebhooks.findFirst({ where: eq(integrationWebhooks.id, id) })
    return c.json({ webhook: row })
})

// ── Delete webhook ───────────────────────────────────────────────────
webhooks.delete("/:id", async (c) => {
    const authUser = c.get("authUser") as { orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const id = c.req.param("id")
    await db.update(integrationWebhooks)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)))

    return c.json({ ok: true })
})

// ── Send test delivery ───────────────────────────────────────────────
webhooks.post("/:id/test", async (c) => {
    const authUser = c.get("authUser") as { orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const id = c.req.param("id")
    const hook = await db.query.integrationWebhooks.findFirst({
        where: and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)),
    })
    if (!hook) return c.json({ error: "Not found" }, 404)

    const testBody = JSON.stringify({
        event: "test",
        timestamp: new Date().toISOString(),
        data: {
            message: "This is a test delivery from Archon",
            webhookId: hook.id,
        },
    })

    const deliveryId = crypto.randomUUID()
    await db.insert(webhookDeliveries).values({
        id: deliveryId,
        webhookId: hook.id,
        orgId: hook.orgId,
        event: "test",
        url: hook.url,
        status: "pending",
    })

    const result = await deliverWebhook(hook, "test", testBody, deliveryId)
    return c.json({ ok: result.success, statusCode: result.statusCode, duration: result.duration, error: result.error })
})

// ── List delivery history ────────────────────────────────────────────
webhooks.get("/:id/deliveries", async (c) => {
    const authUser = c.get("authUser") as { orgId: string }
    const id = c.req.param("id")

    const hook = await db.query.integrationWebhooks.findFirst({
        where: and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)),
    })
    if (!hook) return c.json({ error: "Not found" }, 404)

    const deliveries = await db.query.webhookDeliveries.findMany({
        where: eq(webhookDeliveries.webhookId, id),
        orderBy: [desc(webhookDeliveries.createdAt)],
        limit: 50,
    })

    return c.json({ deliveries })
})

// ── Retry a failed delivery ──────────────────────────────────────────
webhooks.post("/:id/deliveries/:deliveryId/retry", async (c) => {
    const authUser = c.get("authUser") as { orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const { id, deliveryId } = c.req.param()

    const hook = await db.query.integrationWebhooks.findFirst({
        where: and(eq(integrationWebhooks.id, id), eq(integrationWebhooks.orgId, authUser.orgId)),
    })
    if (!hook) return c.json({ error: "Webhook not found" }, 404)

    const delivery = await db.query.webhookDeliveries.findFirst({
        where: and(eq(webhookDeliveries.id, deliveryId), eq(webhookDeliveries.webhookId, id)),
    })
    if (!delivery) return c.json({ error: "Delivery not found" }, 404)

    // Rebuild body (simplified — just resend a retry event with original event type)
    const retryBody = JSON.stringify({
        event: delivery.event,
        timestamp: new Date().toISOString(),
        data: { message: "Retry delivery from Archon", originalDeliveryId: deliveryId },
    })

    // Create new delivery record for the retry
    const newDeliveryId = crypto.randomUUID()
    await db.insert(webhookDeliveries).values({
        id: newDeliveryId,
        webhookId: id,
        orgId: authUser.orgId,
        event: delivery.event,
        url: hook.url,
        status: "pending",
        attempts: (delivery.attempts || 1) + 1,
    })

    const result = await deliverWebhook(hook, delivery.event, retryBody, newDeliveryId)
    return c.json({ ok: result.success, statusCode: result.statusCode, duration: result.duration, deliveryId: newDeliveryId })
})

export default webhooks
