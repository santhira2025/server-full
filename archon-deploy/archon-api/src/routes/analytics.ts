/**
 * Analytics API Routes (Feature 4.4)
 *
 * Provides review quality metrics, complexity trends, coverage gaps,
 * and efficiency metrics over time.
 */
import { Hono } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { users, repos, reviewResults, developerProfiles, learningEvents, reviewLearnings } from "../db/schema.js"
import { eq, and, desc, gte } from "drizzle-orm"

type Variables = { userId: string }

const analytics = new Hono<{ Variables: Variables }>()

// Auth middleware — same pattern as coaching.ts
analytics.use("*", async (c, next) => {
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

/** Helper: resolve orgId from authenticated user */
async function getOrgId(c: any): Promise<string | null> {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    return user?.orgId || null
}

// ── Review Stats Over Time ──────────────────────────────────────────

analytics.get("/reviews", async (c) => {
    const orgId = await getOrgId(c)
    if (!orgId) return c.json({ error: "No org found" }, 404)

    const days = parseInt(c.req.query("days") || "30")
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const reviews = await db.query.reviewResults.findMany({
        where: and(
            eq(reviewResults.orgId, orgId),
            gte(reviewResults.createdAt, since),
        ),
        orderBy: [desc(reviewResults.createdAt)],
    })

    // Aggregate by day
    const byDay: Record<string, { count: number; approved: number; changes: number; comments: number; tokens: number }> = {}

    for (const r of reviews) {
        const day = r.createdAt?.toISOString().split('T')[0] || 'unknown'
        if (!byDay[day]) byDay[day] = { count: 0, approved: 0, changes: 0, comments: 0, tokens: 0 }
        byDay[day].count++
        if (r.verdict === 'APPROVE') byDay[day].approved++
        if (r.verdict === 'REQUEST_CHANGES') byDay[day].changes++
        byDay[day].comments += r.inlineCommentsCount || 0
        byDay[day].tokens += (r.inputTokens || 0) + (r.outputTokens || 0)
    }

    // Summary stats
    const total = reviews.length
    const approved = reviews.filter(r => r.verdict === 'APPROVE').length
    const requestChanges = reviews.filter(r => r.verdict === 'REQUEST_CHANGES').length
    const totalComments = reviews.reduce((sum, r) => sum + (r.inlineCommentsCount || 0), 0)
    const totalTokens = reviews.reduce((sum, r) => sum + (r.inputTokens || 0) + (r.outputTokens || 0), 0)
    const avgComments = total > 0 ? Math.round(totalComments / total * 10) / 10 : 0
    const securityIssues = reviews.reduce((sum, r) => sum + (r.securityIssuesCount || 0), 0)

    return c.json({
        summary: {
            total, approved, requestChanges,
            totalComments, avgComments,
            totalTokens, securityIssues,
            approvalRate: total > 0 ? Math.round(approved / total * 100) : 0,
        },
        byDay,
    })
})

// ── Quality Metrics ─────────────────────────────────────────────────

analytics.get("/quality", async (c) => {
    const orgId = await getOrgId(c)
    if (!orgId) return c.json({ error: "No org found" }, 404)

    // Top issue categories from learning events
    const events = await db.query.learningEvents.findMany({
        where: eq(learningEvents.orgId, orgId),
        orderBy: [desc(learningEvents.createdAt)],
        limit: 200,
    })

    const issueCategories: Record<string, number> = {}
    const severityCounts: Record<string, number> = {}
    for (const e of events) {
        const type = e.mistakeType || 'unknown'
        issueCategories[type] = (issueCategories[type] || 0) + 1
        const sev = e.severity || 'medium'
        severityCounts[sev] = (severityCounts[sev] || 0) + 1
    }

    // Feedback learning stats
    const learnings = await db.query.reviewLearnings.findMany({
        where: eq(reviewLearnings.orgId, orgId),
    })

    const feedbackStats = {
        total: learnings.length,
        positive: learnings.filter(l => l.feedbackType === 'positive').length,
        negative: learnings.filter(l => l.feedbackType === 'negative').length,
        corrections: learnings.filter(l => l.feedbackType === 'correction').length,
    }

    const acceptanceRate = feedbackStats.total > 0
        ? Math.round(feedbackStats.positive / feedbackStats.total * 100)
        : 0

    return c.json({
        issueCategories: Object.entries(issueCategories)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(([category, count]) => ({ category, count })),
        severityDistribution: severityCounts,
        feedbackStats,
        acceptanceRate,
    })
})

// ── Developer Skill Progression ─────────────────────────────────────

analytics.get("/developers", async (c) => {
    const orgId = await getOrgId(c)
    if (!orgId) return c.json({ error: "No org found" }, 404)

    const profiles = await db.query.developerProfiles.findMany({
        where: eq(developerProfiles.orgId, orgId),
        orderBy: [desc(developerProfiles.totalReviews)],
    })

    return c.json({
        developers: profiles.map(p => ({
            login: p.githubLogin,
            skillLevel: p.skillLevel,
            totalReviews: p.totalReviews,
            totalIssues: p.totalIssuesFound,
            repeatedMistakes: p.repeatedMistakes,
            securityScore: p.securityScore,
            weakAreas: p.weakAreas,
            strongAreas: p.strongAreas,
            lastReviewed: p.lastReviewedAt,
        })),
    })
})

// ── Token Cost Trends ───────────────────────────────────────────────

analytics.get("/costs", async (c) => {
    const orgId = await getOrgId(c)
    if (!orgId) return c.json({ error: "No org found" }, 404)

    const days = parseInt(c.req.query("days") || "30")
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    const reviews = await db.query.reviewResults.findMany({
        where: and(
            eq(reviewResults.orgId, orgId),
            gte(reviewResults.createdAt, since),
        ),
        orderBy: [desc(reviewResults.createdAt)],
    })

    const byDay: Record<string, { input: number; output: number; reviews: number }> = {}

    for (const r of reviews) {
        const day = r.createdAt?.toISOString().split('T')[0] || 'unknown'
        if (!byDay[day]) byDay[day] = { input: 0, output: 0, reviews: 0 }
        byDay[day].input += r.inputTokens || 0
        byDay[day].output += r.outputTokens || 0
        byDay[day].reviews++
    }

    const totalInput = reviews.reduce((sum, r) => sum + (r.inputTokens || 0), 0)
    const totalOutput = reviews.reduce((sum, r) => sum + (r.outputTokens || 0), 0)

    return c.json({
        summary: { totalInput, totalOutput, totalReviews: reviews.length },
        byDay,
    })
})

// ── Per-Repo Breakdown ───────────────────────────────────────────────

analytics.get("/repos", async (c) => {
    const orgId = await getOrgId(c)
    if (!orgId) return c.json({ error: "No org found" }, 404)

    const days = parseInt(c.req.query("days") || "30")
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

    // All repos for this org
    const orgRepos = await db.query.repos.findMany({
        where: eq(repos.orgId, orgId),
    })

    // All reviews for this org in the time window
    const reviews = await db.query.reviewResults.findMany({
        where: and(
            eq(reviewResults.orgId, orgId),
            gte(reviewResults.createdAt, since),
        ),
        orderBy: [desc(reviewResults.createdAt)],
    })

    // Group by repo
    const repoStats: Record<string, {
        repoName: string
        reviews: number
        approved: number
        requestChanges: number
        inlineComments: number
        securityIssues: number
        inputTokens: number
        outputTokens: number
        lastReviewedAt: string | null
    }> = {}

    // Pre-populate all repos even if no reviews
    for (const r of orgRepos) {
        repoStats[r.fullName] = {
            repoName: r.fullName,
            reviews: 0,
            approved: 0,
            requestChanges: 0,
            inlineComments: 0,
            securityIssues: 0,
            inputTokens: 0,
            outputTokens: 0,
            lastReviewedAt: null,
        }
    }

    for (const r of reviews) {
        const name = r.repo
        if (!repoStats[name]) {
            repoStats[name] = {
                repoName: name,
                reviews: 0,
                approved: 0,
                requestChanges: 0,
                inlineComments: 0,
                securityIssues: 0,
                inputTokens: 0,
                outputTokens: 0,
                lastReviewedAt: null,
            }
        }
        const s = repoStats[name]
        s.reviews++
        if (r.verdict === "APPROVE") s.approved++
        if (r.verdict === "REQUEST_CHANGES") s.requestChanges++
        s.inlineComments += r.inlineCommentsCount || 0
        s.securityIssues += r.securityIssuesCount || 0
        s.inputTokens += r.inputTokens || 0
        s.outputTokens += r.outputTokens || 0
        const reviewedAt = r.completedAt?.toISOString() || r.createdAt?.toISOString() || null
        if (!s.lastReviewedAt || (reviewedAt && reviewedAt > s.lastReviewedAt)) {
            s.lastReviewedAt = reviewedAt
        }
    }

    const repoList = Object.values(repoStats)
        .sort((a, b) => b.reviews - a.reviews)
        .map(s => ({
            ...s,
            approvalRate: s.reviews > 0 ? Math.round(s.approved / s.reviews * 100) : 0,
            avgComments: s.reviews > 0 ? Math.round(s.inlineComments / s.reviews * 10) / 10 : 0,
        }))

    return c.json({ repos: repoList, days })
})

export default analytics
