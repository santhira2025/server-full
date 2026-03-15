import { Hono } from "hono"
import { z } from "zod"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { repos, users } from "../db/schema.js"
import { eq } from "drizzle-orm"

const repoSettingsSchema = z.object({
    autoReview: z.boolean().optional(),
    autoReviewFocus: z.array(z.string()).optional(),
    model: z.string().optional(),
    securityScan: z.boolean().optional(),
    autoTriage: z.boolean().optional(),
    enableIntentValidation: z.boolean().optional(),
    enableAIAudit: z.boolean().optional(),
}).strict()

type Variables = { userId: string }

const reposRoute = new Hono<{ Variables: Variables }>()

// Auth middleware (same pattern as dashboard.ts)
reposRoute.use("*", async (c, next) => {
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

// GET /repos - List repos for user's org
reposRoute.get("/", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const orgRepos = await db.query.repos.findMany({
        where: eq(repos.orgId, user.orgId),
    })

    return c.json({ repos: orgRepos })
})

// PUT /repos/:id/settings - Update repo settings
reposRoute.put("/:id/settings", async (c) => {
    const repoId = c.req.param("id")
    const raw = await c.req.json()
    const parsed = repoSettingsSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const settings = parsed.data

    await db.update(repos)
        .set({ settings })
        .where(eq(repos.id, repoId))

    return c.json({ ok: true, settings })
})

export default reposRoute
