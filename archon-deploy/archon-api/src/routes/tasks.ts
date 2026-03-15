import { Hono } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { tasks, users } from "../db/schema.js"
import { and, desc, eq } from "drizzle-orm"

type Variables = { userId: string }

const tasksRoute = new Hono<{ Variables: Variables }>()

tasksRoute.use("*", async (c, next) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401)
    }
    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)
    if (!payload) return c.json({ error: "Invalid token" }, 401)
    c.set("userId", payload.userId)
    await next()
})

tasksRoute.get("/", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const limit = Number(c.req.query("limit")) || 50
    const offset = Number(c.req.query("offset")) || 0
    const status = c.req.query("status")

    const conditions = [eq(tasks.orgId, user.orgId)]
    if (status) conditions.push(eq(tasks.status, status))

    const result = await db.query.tasks.findMany({
        where: conditions.length > 1 ? and(...conditions) : conditions[0],
        orderBy: [desc(tasks.createdAt)],
        limit,
        offset,
    })

    return c.json({ tasks: result })
})

tasksRoute.get("/:id", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const taskId = c.req.param("id")
    const task = await db.query.tasks.findFirst({
        where: and(eq(tasks.id, taskId), eq(tasks.orgId, user.orgId)),
    })

    if (!task) return c.json({ error: "Task not found" }, 404)
    return c.json({ task })
})

export default tasksRoute
