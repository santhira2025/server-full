import { Hono } from "hono"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { requireAuthUser, type AuthUser } from "../lib/authz.js"
import { db } from "../db/client.js"
import { organizations, reviewResults } from "../db/schema.js"
import { routeToModel } from "../services/ai-proxy.js"
import { runReviewEngine } from "../services/review-engine.js"

const reviewSchema = z.object({
    repo: z.string().min(1),
    pr: z.number().int().positive(),
    model: z.string().optional(),
    focus: z.array(z.string()).optional(),
})

const apiV1 = new Hono<{ Variables: { authUser: AuthUser } }>()

apiV1.use("*", async (c, next) => {
    const user = await requireAuthUser(c)
    if (!user) return c.json({ error: "Unauthorized" }, 401)
    c.set("authUser", user)
    await next()
})

apiV1.post("/review", async (c) => {
    const authUser = c.get("authUser") as { orgId: string }
    const raw = await c.req.json()
    const parsed = reviewSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const { repo: repoFullName, pr: prNumber, model: bodyModel, focus: bodyFocus } = parsed.data

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, authUser.orgId),
    })
    if (!org?.installationId) {
        return c.json({ error: "GitHub App installation not linked" }, 400)
    }

    const modelConfig = routeToModel(org.plan || "free")
    const model = bodyModel || modelConfig.modelId
    const focus = bodyFocus || ["security", "bugs"]

    const result = await runReviewEngine({
        installationId: org.installationId,
        orgId: authUser.orgId,
        repoFullName,
        issueNumber: prNumber,
        actionType: "review",
        model,
        provider: modelConfig.provider,
        apiKey: modelConfig.apiKey,
        reviewFocus: focus,
        enableIntentValidation: true,
        enableAIAudit: true,
    })

    const latest = await db.query.reviewResults.findFirst({
        where: and(
            eq(reviewResults.orgId, authUser.orgId),
            eq(reviewResults.repo, repoFullName),
            eq(reviewResults.issueNumber, prNumber),
            eq(reviewResults.actionType, "review"),
        ),
        orderBy: [desc(reviewResults.createdAt)],
    })

    return c.json({
        id: latest?.id || null,
        status: "completed",
        verdict: result.verdict,
        issues: {
            inline: result.inlineComments,
            security: result.securityIssues,
        },
        coaching: result.coachingSummary || null,
    })
})

export default apiV1
