import { Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { eventLogs, reviewResults, users, tasks } from "../db/schema.js"
import { eq, desc } from "drizzle-orm"
import { getOrSet } from "../services/cache.js"

// SSE cache TTL matches the poll interval — all users in the same org
// share one DB query per table per 10-second window instead of N queries.
const SSE_TTL = 10

const sse = new Hono()

sse.get("/stream", async (c) => {
    const token = c.req.query("token")
    if (!token) return c.json({ error: "Unauthorized" }, 401)

    const payload = verifyToken(token)
    if (!payload) return c.json({ error: "Invalid token" }, 401)

    const user = await db.query.users.findFirst({
        where: eq(users.id, payload.userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const orgId = user.orgId

    return streamSSE(c, async (stream) => {
        let lastEventTime = new Date()
        let lastReviewTime = new Date()
        let lastTaskTime = new Date()

        while (true) {
            try {
                const [newEvents, newReviews, newTasks] = await Promise.all([
                    getOrSet(
                        `sse:events:${orgId}`,
                        SSE_TTL,
                        () => db.query.eventLogs.findMany({
                            where: eq(eventLogs.orgId, orgId),
                            orderBy: [desc(eventLogs.createdAt)],
                            limit: 5,
                        })
                    ),
                    getOrSet(
                        `sse:reviews:${orgId}`,
                        SSE_TTL,
                        () => db.query.reviewResults.findMany({
                            where: eq(reviewResults.orgId, orgId),
                            orderBy: [desc(reviewResults.createdAt)],
                            limit: 5,
                        })
                    ),
                    getOrSet(
                        `sse:tasks:${orgId}`,
                        SSE_TTL,
                        () => db.query.tasks.findMany({
                            where: eq(tasks.orgId, orgId),
                            orderBy: [desc(tasks.createdAt)],
                            limit: 5,
                        })
                    ),
                ])

                const freshEvents = newEvents.filter(
                    (e) => new Date(e.createdAt!) > lastEventTime
                )
                const freshReviews = newReviews.filter(
                    (r) => new Date(r.createdAt!) > lastReviewTime
                )
                const freshTasks = newTasks.filter(
                    (t) => new Date(t.createdAt!) > lastTaskTime
                )

                if (freshEvents.length > 0) {
                    await stream.writeSSE({
                        data: JSON.stringify({ type: "events", items: freshEvents }),
                        event: "events",
                    })
                    lastEventTime = new Date(freshEvents[0].createdAt!)
                }

                if (freshReviews.length > 0) {
                    await stream.writeSSE({
                        data: JSON.stringify({ type: "reviews", items: freshReviews }),
                        event: "reviews",
                    })
                    lastReviewTime = new Date(freshReviews[0].createdAt!)
                }

                if (freshTasks.length > 0) {
                    await stream.writeSSE({
                        data: JSON.stringify({ type: "tasks", items: freshTasks }),
                        event: "tasks",
                    })
                    lastTaskTime = new Date(freshTasks[0].createdAt!)
                }

                await stream.writeSSE({
                    data: JSON.stringify({ type: "heartbeat", time: Date.now() }),
                    event: "heartbeat",
                })
            } catch {
                break
            }

            await stream.sleep(10000)
        }
    })
})

export default sse
