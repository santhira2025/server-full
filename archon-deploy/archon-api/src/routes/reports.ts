import { Hono } from "hono"
import { Octokit } from "@octokit/rest"
import { z } from "zod"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { users, repos, organizations, reviewResults, tasks } from "../db/schema.js"
import { eq, and, desc, or } from "drizzle-orm"
import { getInstallationToken } from "../services/github.js"
import { runReviewEngine } from "../services/review-engine.js"
import { routeToModel } from "../services/ai-proxy.js"

const runReportSchema = z.object({
    repoId: z.string().min(1),
    action: z.enum(["analyze", "report", "security", "full-review", "security-audit"]),
    issueNumber: z.number().int().nonnegative().optional(),
})

type Variables = { userId: string }

const reports = new Hono<{ Variables: Variables }>()

// Auth middleware
reports.use("*", async (c, next) => {
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

// GET /api/reports — List all analyze/report/security review results for the org
reports.get("/", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const repoFilter = c.req.query("repo")
    const typeFilter = c.req.query("type") // analyze | report | security
    const limit = Math.min(Number(c.req.query("limit")) || 20, 100)

    const conditions: any[] = [eq(reviewResults.orgId, user.orgId)]
    if (repoFilter) conditions.push(eq(reviewResults.repo, repoFilter))
    if (typeFilter) {
        conditions.push(eq(reviewResults.actionType, typeFilter))
    } else {
        // Default: show all meaningful report types
        conditions.push(
            or(
                eq(reviewResults.actionType, "analyze"),
                eq(reviewResults.actionType, "report"),
                eq(reviewResults.actionType, "security"),
                eq(reviewResults.actionType, "review"),
                eq(reviewResults.actionType, "full-review"),
                eq(reviewResults.actionType, "security-audit"),
            )!
        )
    }

    const results = await db.query.reviewResults.findMany({
        where: and(...conditions),
        orderBy: [desc(reviewResults.completedAt)],
        limit,
    })

    return c.json({ reports: results })
})

// GET /api/reports/tasks — List pending/running report tasks for the org
reports.get("/tasks", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const activeTasks = await db.query.tasks.findMany({
        where: and(
            eq(tasks.orgId, user.orgId),
            or(
                eq(tasks.taskType, "analyze"),
                eq(tasks.taskType, "report"),
                eq(tasks.taskType, "security"),
                eq(tasks.taskType, "full-review"),
                eq(tasks.taskType, "security-audit"),
            )!
        ),
        orderBy: [desc(tasks.createdAt)],
        limit: 10,
    })

    return c.json({ tasks: activeTasks })
})

// POST /api/reports/run — Trigger analyze or report for a repo
// Body: { repoId: string, action: "analyze" | "report" | "security", issueNumber?: number }
reports.post("/run", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const raw = await c.req.json().catch(() => null)
    const parsed = runReportSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const body = parsed.data

    // Look up repo
    const repo = await db.query.repos.findFirst({
        where: and(eq(repos.id, body.repoId), eq(repos.orgId, user.orgId)),
    })
    if (!repo) return c.json({ error: "Repository not found" }, 404)

    // Look up org for installationId
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org?.installationId) {
        return c.json({ error: "GitHub App not installed for this organization" }, 400)
    }

    const modelConfig = routeToModel(org.plan || "free")
    const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

    // Create a task record
    await db.insert(tasks).values({
        id: taskId,
        orgId: user.orgId,
        repo: repo.fullName,
        issueNumber: body.issueNumber || 0,
        taskType: body.action,
        status: "queued",
        triggerType: "manual",
        triggeredBy: user.githubLogin,
        createdAt: new Date(),
    })

    // Fire-and-forget — run in background
    ;(async () => {
        try {
            await db
                .update(tasks)
                .set({ status: "processing", startedAt: new Date() })
                .where(eq(tasks.id, taskId))

            const result = await runReviewEngine({
                installationId: org.installationId!,
                orgId: user.orgId!,
                repoFullName: repo.fullName,
                issueNumber: body.issueNumber || 0,
                actionType: body.action,
                model: modelConfig.modelId,
                provider: modelConfig.provider,
                apiKey: modelConfig.apiKey,
                requestedBy: user.githubLogin,
                taskId,
            })

            await db
                .update(tasks)
                .set({
                    status: "completed",
                    completedAt: new Date(),
                    summary: result.summary?.substring(0, 500) || null,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                })
                .where(eq(tasks.id, taskId))
        } catch (err: any) {
            console.error(`Report task ${taskId} failed:`, err.message)
            await db
                .update(tasks)
                .set({ status: "failed", completedAt: new Date(), error: err.message })
                .where(eq(tasks.id, taskId))
        }
    })()

    return c.json({ taskId, status: "queued", message: `${body.action} started for ${repo.fullName}` })
})

// GET /api/reports/:id — Get a single report result
reports.get("/:id", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const reportId = c.req.param("id")
    const result = await db.query.reviewResults.findFirst({
        where: and(eq(reviewResults.id, reportId), eq(reviewResults.orgId, user.orgId)),
    })

    if (!result) return c.json({ error: "Report not found" }, 404)
    return c.json({ report: result })
})

// GET /api/reports/:id/download — Download report as markdown file from GitHub
reports.get("/:id/download", async (c) => {
    const userId = c.get("userId")
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
    if (!user?.orgId) return c.json({ error: "No organization found" }, 404)

    const reportId = c.req.param("id")
    const result = await db.query.reviewResults.findFirst({
        where: and(eq(reviewResults.id, reportId), eq(reviewResults.orgId, user.orgId)),
    })
    if (!result) return c.json({ error: "Report not found" }, 404)

    // Look up the org for installationId
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org?.installationId) {
        return c.json({ error: "GitHub App not installed" }, 400)
    }

    const [owner, repo] = result.repo.split("/")
    const date = result.completedAt
        ? new Date(result.completedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]
    const filename = `archon-${result.actionType}-${result.repo.replace("/", "-")}-${date}.md`

    const serveContent = (content: string) =>
        new Response(content, {
            headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${filename}"`,
            },
        })

    const storedData = result.resultData as Record<string, any> | null

    // 1. PR review: build structured report from stored inline comments + security issues
    if (result.actionType === "review" || result.actionType === "security") {
        if (storedData?.fullReport) {
            return serveContent(storedData.fullReport)
        }
        if (storedData?.inlineComments || storedData?.securityIssues) {
            return serveContent(buildPRReportMarkdown(result, storedData))
        }
    }

    // 2. Comprehensive reports and standard reports: check resultData first, then fetch from GitHub
    if (storedData?.fullReport) {
        return serveContent(storedData.fullReport)
    }

    let filePath: string | null = null
    if (result.actionType === "report") filePath = `.archon/reports/security-${date}.md`
    else if (result.actionType === "analyze") filePath = `.archon/memory.md`
    else if (result.actionType === "full-review") filePath = `.archon/reports/technical-review-${date}.md`
    else if (result.actionType === "security-audit") filePath = `.archon/reports/security-audit-${date}.md`

    if (filePath) {
        try {
            const token = await getInstallationToken(org.installationId!)
            const octokit = new Octokit({ auth: token })
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: filePath })
            if ("content" in data) {
                const content = Buffer.from(data.content as string, "base64").toString("utf-8")
                return serveContent(content)
            }
        } catch (err: any) {
            if (err.status !== 404) throw err
        }
    }

    // 3. Fallback: build a basic markdown document from stored summary
    return serveContent(buildDownloadMarkdown(result))
})

function buildPRReportMarkdown(
    result: typeof reviewResults.$inferSelect,
    data: Record<string, any>
): string {
    const date = result.completedAt
        ? new Date(result.completedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]

    const inlineComments: Array<{ path: string; line: number; severity: string; body: string }> =
        data.inlineComments || []
    const securityIssues: Array<{ title: string; severity: string; file: string; line?: number; description: string }> =
        data.securityIssues || []

    const verdictEmoji: Record<string, string> = {
        APPROVE: "✅",
        REQUEST_CHANGES: "❌",
        COMMENT: "💬",
    }

    const parts: string[] = [
        `# PR Review Report: ${result.repo} #${result.issueNumber}`,
        ``,
        `**Repository:** ${result.repo}`,
        `**PR Number:** #${result.issueNumber}`,
        `**Date:** ${date}`,
        `**Verdict:** ${verdictEmoji[result.verdict || ""] || ""} ${result.verdict || "N/A"}`,
        `**Files Reviewed:** ${result.filesReviewed ?? 0}`,
        `**Inline Comments:** ${result.inlineCommentsCount ?? inlineComments.length}`,
        `**Security Issues:** ${result.securityIssuesCount ?? securityIssues.length}`,
        ``,
        `---`,
        ``,
        `## Summary`,
        ``,
        (result.summary || "").substring(0, 1200) || "_No summary available._",
    ]

    if (inlineComments.length > 0) {
        parts.push(``, `---`, ``, `## Inline Comments (${inlineComments.length})`)
        for (const c of inlineComments) {
            const sev = c.severity?.toUpperCase() || "INFO"
            const sevEmoji: Record<string, string> = { CRITICAL: "🔴", WARNING: "🟡", SUGGESTION: "🔵", INFO: "⚪" }
            parts.push(
                ``,
                `### \`${c.path}\` — Line ${c.line}`,
                `**Severity:** ${sevEmoji[sev] || ""} ${sev}`,
                ``,
                (c.body || "").split("\n").map(l => `> ${l}`).join("\n"),
            )
        }
    }

    if (securityIssues.length > 0) {
        parts.push(``, `---`, ``, `## Security Issues (${securityIssues.length})`)
        for (const s of securityIssues) {
            const sev = s.severity?.toUpperCase() || "MEDIUM"
            const sevEmoji: Record<string, string> = { CRITICAL: "🔴", HIGH: "🟠", MEDIUM: "🟡", LOW: "🟢" }
            parts.push(
                ``,
                `### ${s.title || "Security Issue"}`,
                `**Severity:** ${sevEmoji[sev] || ""} ${sev} | **Location:** \`${s.file}${s.line ? `:${s.line}` : ""}\``,
                ``,
                s.description || "",
            )
        }
    }

    if (data.coachingSummary) {
        parts.push(``, `---`, ``, `## Coaching Notes`, ``, data.coachingSummary)
    }

    parts.push(``, `---`, ``, `*Generated by Archon AI — review all findings before acting.*`)

    return parts.join("\n")
}

function buildDownloadMarkdown(result: typeof reviewResults.$inferSelect): string {
    const date = result.completedAt
        ? new Date(result.completedAt).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0]

    return [
        `# Archon ${result.actionType.charAt(0).toUpperCase() + result.actionType.slice(1)} Report`,
        ``,
        `**Repository:** ${result.repo}`,
        `**Date:** ${date}`,
        `**Action:** ${result.actionType}`,
        `**Status:** ${result.status}`,
        result.verdict ? `**Verdict:** ${result.verdict}` : "",
        ``,
        `## Summary`,
        ``,
        result.summary || "_No summary available._",
        ``,
        result.filesReviewed ? `**Files Reviewed:** ${result.filesReviewed}` : "",
        result.securityIssuesCount ? `**Security Issues Found:** ${result.securityIssuesCount}` : "",
        result.inlineCommentsCount ? `**Inline Comments:** ${result.inlineCommentsCount}` : "",
    ]
        .filter((line) => line !== undefined)
        .join("\n")
}

export default reports
