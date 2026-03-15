import { Hono } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { eventLogs, reviewResults, users } from "../db/schema.js"
import { eq, desc } from "drizzle-orm"

type Variables = { userId: string }

const events = new Hono<{ Variables: Variables }>()

// Auth middleware
events.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401)
    }

    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)
    if (!payload) {
        return c.json({ error: "Invalid token" }, 401)
    }

    c.set("userId", payload.userId)
    await next()
})

// GET /events/logs - Paginated event log
events.get("/logs", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100)
    const offset = parseInt(c.req.query("offset") || "0")

    const logs = await db.query.eventLogs.findMany({
        where: eq(eventLogs.orgId, user.orgId),
        orderBy: [desc(eventLogs.createdAt)],
        limit,
        offset,
    })

    return c.json({ logs })
})

// GET /events/reviews - Past review results
events.get("/reviews", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const limit = Math.min(parseInt(c.req.query("limit") || "50"), 100)
    const offset = parseInt(c.req.query("offset") || "0")

    const reviews = await db.query.reviewResults.findMany({
        where: eq(reviewResults.orgId, user.orgId),
        orderBy: [desc(reviewResults.createdAt)],
        limit,
        offset,
    })

    return c.json({ reviews })
})

// GET /events/reviews/:id - Single review detail
events.get("/reviews/:id", async (c) => {
    const reviewId = c.req.param("id")

    const review = await db.query.reviewResults.findFirst({
        where: eq(reviewResults.id, reviewId),
    })

    if (!review) return c.json({ error: "Review not found" }, 404)

    return c.json({ review })
})

export default events
