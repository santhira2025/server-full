import { Hono } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { users, developerProfiles } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { generateTeamReport, getDeveloperHistory, getDeveloperProfile } from "../services/coaching.js"

type Variables = { userId: string }

const coaching = new Hono<{ Variables: Variables }>()

// Auth middleware
coaching.use("*", async (c, next) => {
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

// GET /coaching/team-report — Team knowledge gap report
coaching.get("/team-report", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No org found" }, 404)

    const report = await generateTeamReport(user.orgId)
    return c.json({ report })
})

// GET /coaching/developers — List all developer profiles for org
coaching.get("/developers", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No org found" }, 404)

    const profiles = await db.query.developerProfiles.findMany({
        where: eq(developerProfiles.orgId, user.orgId),
    })

    return c.json({ developers: profiles })
})

// GET /coaching/developers/:login — Single developer profile + history
coaching.get("/developers/:login", async (c) => {
    const userId = c.get("userId")
    const login = c.req.param("login")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No org found" }, 404)

    const profile = await getDeveloperProfile(user.orgId, login)
    const history = await getDeveloperHistory(user.orgId, login)

    return c.json({ profile, history })
})

export default coaching
