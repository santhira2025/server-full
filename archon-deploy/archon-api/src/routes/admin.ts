import { Hono } from "hono"
import { and, desc, eq } from "drizzle-orm"
import { requireAuthUser, hasMinimumRole, type AuthUser } from "../lib/authz.js"
import { db } from "../db/client.js"
import { eventLogs, integrationWebhooks, prRiskScores, releaseNotes, reviewResults, users } from "../db/schema.js"

const admin = new Hono<{ Variables: { authUser: AuthUser } }>()

admin.use("*", async (c, next) => {
    const user = await requireAuthUser(c)
    if (!user) return c.json({ error: "Unauthorized" }, 401)
    if (!hasMinimumRole(user.role, "viewer")) return c.json({ error: "Forbidden" }, 403)
    c.set("authUser", user)
    await next()
})

admin.get("/overview", async (c) => {
    const authUser = c.get("authUser") as { orgId: string }

    const [team, risks, notes, hooks, events, reviews] = await Promise.all([
        db.query.users.findMany({ where: eq(users.orgId, authUser.orgId) }),
        db.query.prRiskScores.findMany({
            where: eq(prRiskScores.orgId, authUser.orgId),
            orderBy: [desc(prRiskScores.createdAt)],
            limit: 10,
        }),
        db.query.releaseNotes.findMany({
            where: eq(releaseNotes.orgId, authUser.orgId),
            orderBy: [desc(releaseNotes.createdAt)],
            limit: 10,
        }),
        db.query.integrationWebhooks.findMany({
            where: and(eq(integrationWebhooks.orgId, authUser.orgId), eq(integrationWebhooks.isActive, true)),
        }),
        db.query.eventLogs.findMany({
            where: eq(eventLogs.orgId, authUser.orgId),
            orderBy: [desc(eventLogs.createdAt)],
            limit: 20,
        }),
        db.query.reviewResults.findMany({
            where: eq(reviewResults.orgId, authUser.orgId),
            orderBy: [desc(reviewResults.createdAt)],
            limit: 20,
        }),
    ])

    return c.json({
        metrics: {
            teamMembers: team.length,
            admins: team.filter((m) => m.role === "admin" || m.role === "owner").length,
            activeWebhooks: hooks.length,
            recentHighRiskPRs: risks.filter((r) => r.riskLevel === "high").length,
            reviewsLast20: reviews.length,
        },
        team,
        risks,
        releaseNotes: notes,
        webhooks: hooks,
        events,
        reviews,
    })
})

export default admin
