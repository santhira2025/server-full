import { Hono } from "hono"
import crypto from "crypto"
import { Octokit } from "@octokit/rest"
import { eq } from "drizzle-orm"
import { verifyGitHubWebhook } from "../lib/verify-webhook.js"
import { db } from "../db/client.js"
import { organizations, repos, eventLogs, tasks } from "../db/schema.js"
import { getInstallationToken, postComment, updateComment } from "../services/github.js"
import { routeToModel } from "../services/ai-proxy.js"
import { runReviewEngine, callAI, getLastReviewedSha } from "../services/review-engine.js"
import { runChat, isChatQuestion } from "../services/chat.js"
import { recordUsage, checkUserQuota, getUserPlan } from "../services/usage.js"
import { updateMemoryOnMerge, runFullProjectAnalysis, loadProjectMemory } from "../services/project-memory.js"
import { emitIntegrationEvent } from "../services/integration-webhooks.js"
import {
    deriveAutoLabels,
    buildPrDescription,
    buildDependencyAuditMarkdown,
    calculatePrRiskAndReviewer,
    buildRiskComment,
    applyRepoRules,
    buildCiFailureAnalysis,
    generateAndStoreReleaseNotes,
} from "../services/automation.js"
import { applyApprovalWorkflow, type ApprovalConfig } from "../services/approval.js"
import { updateDeveloperProfile, recordPositiveReinforcement, learnReviewerPreferences } from "../services/coaching.js"
import { processReaction, processReply } from "../services/feedback-learning.js"

const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET
if (!WEBHOOK_SECRET) throw new Error("FATAL: GITHUB_WEBHOOK_SECRET is not set.")

const webhook = new Hono()

// ── Deduplication ────────────────────────────────────────────────────
const processedEvents = new Map<string, number>()
const DEDUP_TTL = 5 * 60 * 1000 // 5 minutes

function isDuplicate(deliveryId: string): boolean {
    const now = Date.now()
    // Cleanup old entries
    for (const [key, ts] of processedEvents) {
        if (now - ts > DEDUP_TTL) processedEvents.delete(key)
    }
    if (processedEvents.has(deliveryId)) return true
    processedEvents.set(deliveryId, now)
    return false
}

// ── Natural language routing ─────────────────────────────────────────
function resolveSubcommand(input: string): string {
    if (!input) return "review"
    const lower = input.toLowerCase()

    // Help — check early
    if (lower.includes("help") || lower.includes("command") || lower.includes("what can")) return "help"

    // Report — check before security to catch "full security report", "security audit", etc.
    if (lower.includes("full report") || lower.includes("security report") ||
        lower.includes("technical review") || lower.includes("audit") ||
        lower.includes("full scan") || lower.includes("full security") ||
        lower.includes("pentest") || lower.includes("vulnerability report") ||
        lower.includes("security audit")) return "report"

    // Security — check before generic "fix" to catch "fix security issues"
    if (lower.includes("secur") || lower.includes("vulnerab") || lower.includes("owasp") || lower.includes("inject") || lower.includes("xss")) return "security"

    // Diagram — check before resolve to catch "create a diagram"
    if (lower.includes("diagr") || lower.includes("mermaid") || lower.includes("architect") || lower.includes("visual") || lower.includes("flowchart") || lower.includes("chart")) return "diagram"

    // Tests
    if (lower.includes("test") || lower.includes("spec") || lower.includes("coverage") || lower.includes("unit test") || lower.includes("jest")) return "tests"

    // Analyze — check before resolve to catch "analyze the project"
    if (lower.includes("analyz") || lower.includes("scan project") || lower.includes("project scan") || lower.includes("memory") || lower.includes("learn project")) return "analyze"

    // Docs
    if (lower.includes("readme") || lower.includes("document") || lower.includes("generate doc") || lower.includes("write doc")) return "docs"

    // Explain
    if (lower.includes("explain") || lower.includes("what does") || lower.includes("what is this") || lower.includes("describe")) return "explain"

    // Fix ALL review comments — must come before generic "fix"
    if ((lower.includes("fix all") || lower.includes("resolve all") || lower.includes("address all"))) return "all"

    // Fix review feedback — distinguish from resolve (creating a new fix branch)
    if ((lower.includes("fix") || lower.includes("address")) &&
        (lower.includes("comment") || lower.includes("feedback") || lower.includes("review"))) return "fix"

    // Resolve (auto-fix and create PR) — for issues and open-ended fix requests
    if (lower.includes("resolve") || lower.includes("create") || lower.includes("enhance") || lower.includes("implement") || lower.includes("add") || lower.includes("build") || lower.includes("generate") || lower.includes("fix")) return "resolve"

    // Chat — question-like free text that doesn't match any command pattern
    // Route before the generic review fallback so developers can ask questions naturally
    if (isChatQuestion(input)) return "chat"

    // Review
    if (lower.includes("review") || lower.includes("check") || lower.includes("feedback") || lower.includes("look at")) return "review"

    return "review"
}

// ── Help message ─────────────────────────────────────────────────────
const HELP_MESSAGE = `## Archon Commands

| Command | Description |
|---------|-------------|
| \`/archon review\` | Full code review with inline comments |
| \`/archon security\` | Security-focused vulnerability scan |
| \`/archon chat <question>\` | Ask any question about this PR or the code |
| \`/archon explain\` | Explain what this code/PR does |
| \`/archon resolve\` | Auto-fix issues and create a PR |
| \`/archon analyze\` | Full project analysis → generates .archon/memory.md |
| \`/archon report\` | Full security & technical review → commits report to \`.archon/reports/\` |
| \`/archon diagram\` | Generate full project architecture Mermaid diagram |
| \`/archon tests\` | Generate test cases for PR changes |
| \`/archon fix\` | Fix the most recent review feedback on this PR |
| \`/archon all\` | Fix ALL review comments on this PR |
| \`/archon docs\` | Generate project documentation & README |
| \`/archon help\` | Show this help message |

**Shortcuts:** \`/ac\` works as an alias for \`/archon\`.

**Chat examples (Q&A mode):**
- \`/archon why is line 42 a security issue?\`
- \`/archon what does the validateToken function do?\`
- \`/archon how should I fix the SQL injection warning?\`
- \`/archon is this approach good for performance?\`
- \`/archon what is the risk of this change to the auth flow?\`

**Label trigger:** Add the \`archon\` label to any issue or PR to auto-trigger resolve (issues) or review (PRs).

**Natural language examples:**
- \`/archon check this for security issues\` → \`security\`
- \`/archon fix the review comments\` → \`fix\`
- \`/archon fix all review feedback\` → \`all\`
- \`/archon create a diagram of this project\` → \`diagram\`
- \`/archon generate test cases\` → \`tests\`
- \`/archon generate a security audit\` → \`report\`
- \`/archon full technical review\` → \`report\`

Archon learns from every review to personalize feedback for your team.`

// ── Main webhook handler ─────────────────────────────────────────────
webhook.post("/", async (c) => {
    const rawBody = await c.req.text()
    const signature = c.req.header("x-hub-signature-256")
    const event = c.req.header("x-github-event")
    const deliveryId = c.req.header("x-github-delivery") || crypto.randomUUID()

    // Always verify webhook signature
    if (!verifyGitHubWebhook(rawBody, signature, WEBHOOK_SECRET)) {
        return c.json({ error: "Invalid signature" }, 401)
    }

    // Deduplication
    if (isDuplicate(deliveryId)) {
        return c.json({ ok: true, message: "duplicate" })
    }

    const payload = JSON.parse(rawBody)

    try {
        switch (event) {
            case "issue_comment":
                await handleIssueComment(payload)
                break
            case "pull_request":
                await handlePullRequest(payload)
                break
            case "pull_request_review":
                await handlePullRequestReview(payload)
                break
            case "check_suite":
                await handleCheckSuite(payload)
                break
            case "release":
                await handleRelease(payload)
                break
            case "installation":
                await handleInstallation(payload)
                break
            case "installation_repositories":
                await handleInstallationRepositories(payload)
                break
            case "pull_request_review_comment":
                await handleReviewCommentFeedback(payload)
                break
            case "issues":
                await handleIssuesEvent(payload)
                break
            case "push":
                await handlePush(payload)
                break
            default:
                console.log(`Unhandled event: ${event}`)
        }
    } catch (err: any) {
        console.error(`Webhook error (${event}):`, err)
        await logEvent(payload, event || "unknown", "failed", err.message)
    }

    return c.json({ ok: true })
})

// ── Task tracking helpers ────────────────────────────────────────────

async function createTask(
    orgId: string, repo: string, issueNumber: number,
    taskType: string, triggerType: string, triggeredBy?: string
): Promise<string> {
    const taskId = crypto.randomUUID()
    await db.insert(tasks).values({
        id: taskId, orgId, repo, issueNumber, taskType,
        status: "queued", triggerType, triggeredBy,
    })
    return taskId
}

async function updateTaskStatus(
    taskId: string, status: string,
    extra?: { summary?: string; error?: string; inputTokens?: number; outputTokens?: number }
) {
    const updates: Record<string, any> = { status }
    if (status === "processing") updates.startedAt = new Date()
    if (status === "completed" || status === "failed") updates.completedAt = new Date()
    if (extra?.summary) updates.summary = extra.summary
    if (extra?.error) updates.error = extra.error
    if (extra?.inputTokens !== undefined) updates.inputTokens = extra.inputTokens
    if (extra?.outputTokens !== undefined) updates.outputTokens = extra.outputTokens
    await db.update(tasks).set(updates).where(eq(tasks.id, taskId))
}

// ── Event Handlers ───────────────────────────────────────────────────

async function handleIssueComment(payload: any) {
    const action = payload.action
    if (action !== "created") return

    // Skip bot comments to prevent infinite loops
    if (payload.comment?.user?.type === "Bot") return

    const comment = (payload.comment?.body || "").trim()
    // Match /archon or /ac with optional subcommand (including 'chat') and optional free text
    const match = comment.match(/^\/(archon|ac)\s*(review|resolve|security|explain|analyze|diagram|tests|fix|all|docs|report|help|chat)?(?:\s+(.*))?/is)
    if (!match) return

    const rawSub = match[2] || ""
    const freeText = match[3] || ""
    const subcommand = rawSub ? rawSub.toLowerCase() : resolveSubcommand(freeText || comment)

    const repoFullName = payload.repository.full_name
    const issueNumber = payload.issue?.number
    const installationId = payload.installation?.id

    if (!installationId || !issueNumber) return

    // Help command — no AI needed
    if (subcommand === "help") {
        const token = await getInstallationToken(installationId)
        await postComment(token, payload, HELP_MESSAGE)
        return
    }

    // Look up org
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) {
        console.warn(`No org found for installation ${installationId}`)
        return
    }

    // Enforce usage quota
    const plan = await getUserPlan(org.id)
    const quota = await checkUserQuota(org.id, plan)
    if (!quota.allowed) {
        const token = await getInstallationToken(installationId)
        await postComment(token, payload,
            `⚠️ **Quota exceeded.** You've used ${quota.used}/${quota.limit} requests this month on the **${plan.name}** plan.\n\nUpgrade at your Archon dashboard to continue.`)
        await logEvent(payload, `command_${subcommand}`, "blocked", `Quota exceeded: ${quota.used}/${quota.limit}`)
        return
    }

    await logEvent(payload, `command_${subcommand}`, "processing", `/${subcommand} on #${issueNumber}`)

    const modelConfig = routeToModel(org.plan || "free")
    const taskId = await createTask(org.id, repoFullName, issueNumber, subcommand, "manual", payload.comment?.user?.login)

    // Post "thinking" message
    const token = await getInstallationToken(installationId)
    const thinkingMessages: Record<string, string> = {
        review: `🔍 **Archon** is reviewing this ${payload.issue?.pull_request ? "PR" : "issue"}...`,
        security: `🔐 **Archon** is scanning for security vulnerabilities...`,
        explain: `📖 **Archon** is analyzing and explaining this ${payload.issue?.pull_request ? "PR" : "issue"}...`,
        resolve: `🔧 **Archon** is generating a fix and creating a PR...`,
        analyze: `🗺️ **Archon** is performing a full project scan...`,
        diagram: `📊 **Archon** is generating an architecture diagram...`,
        tests: `🧪 **Archon** is generating test cases for this PR...`,
        fix: `🔨 **Archon** is reading your review comments and applying fixes directly to this PR...`,
        all: `🔨 **Archon** is reading ALL review comments and applying fixes directly to this PR...`,
        docs: `📚 **Archon** is generating documentation for this project...`,
        report: `📋 **Archon** is generating a full security & technical review report for this project...`,
        chat: `💬 **Archon** is thinking...`,
    }
    const thinkingMsg = thinkingMessages[subcommand] || `🔍 **Archon** is running \`${subcommand}\`...`
    const thinkingId = await postComment(token, payload, thinkingMsg)

    try {
        await updateTaskStatus(taskId, "processing")

        // ── Chat mode: answer a question about the PR ─────────────────────
        if (subcommand === "chat") {
            const question = freeText || comment.replace(/^\/(archon|ac)\s*(chat\s*)?/i, "").trim()
            if (!question) {
                await updateComment(token, payload, thinkingId,
                    `💬 **Archon Chat** — Ask me anything about this PR!\n\nExamples:\n- \`/archon why is line 42 a security issue?\`\n- \`/archon what does validateToken do?\`\n- \`/archon how should I fix the warning?\``)
                return
            }

            if (!payload.issue?.pull_request) {
                // Chat works on PRs only — issues don't have diffs
                await updateComment(token, payload, thinkingId,
                    `💬 **Archon Chat** only works on Pull Requests (needs the code diff for context).\n\nFor issues, try \`/archon resolve\` to generate a fix.`)
                return
            }

            const [owner, repo] = repoFullName.split("/")
            const octokit = new Octokit({ auth: token })

            const chatResult = await runChat(
                octokit, owner, repo, issueNumber,
                question,
                modelConfig.provider, modelConfig.apiKey, modelConfig.modelId,
            )

            await updateComment(token, payload, thinkingId,
                `**Archon:** ${chatResult.answer}`)

            // Record usage
            try {
                await recordUsage({
                    orgId: org.id, userId: org.id, repo: repoFullName,
                    model: modelConfig.modelId,
                    inputTokens: chatResult.inputTokens,
                    outputTokens: chatResult.outputTokens,
                })
            } catch { /* non-fatal */ }

            await logEvent(payload, "command_chat", "completed", `Q: ${question.substring(0, 80)}`)
            await updateTaskStatus(taskId, "completed", {
                summary: `Chat answered: ${question.substring(0, 100)}`,
                inputTokens: chatResult.inputTokens,
                outputTokens: chatResult.outputTokens,
            })
            return  // Chat is done — don't fall through to runReviewEngine
        }

        // ── All other commands → Review Engine ───────────────────────────
        const result = await runReviewEngine({
            installationId,
            orgId: org.id,
            repoFullName,
            issueNumber,
            actionType: subcommand,
            model: modelConfig.modelId,
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            requestedBy: payload.comment?.user?.login,
            reviewFocus: subcommand === "security" ? ["security"] : ["security", "bugs", "performance", "style"],
            enableIntentValidation: subcommand === "review",
            enableAIAudit: subcommand === "review",
        })

        // Update thinking message with result
        if (thinkingId && result.summary) {
            // diagram/analyze post their own full comment — keep the thinking msg short
            const shortSummaryCommands = ["diagram", "analyze", "report"]

            let thinkingBody: string
            if (shortSummaryCommands.includes(subcommand)) {
                thinkingBody = `✅ **Archon ${subcommand}** completed.`
            } else if ((subcommand === 'fix' || subcommand === 'all') && result.filesModified?.length) {
                thinkingBody = `✅ **Archon ${subcommand}** applied fixes to ${result.filesModified.length} file(s).\n\n${result.summary}`
            } else {
                thinkingBody = `✅ **Archon ${subcommand}** completed.\n\n${result.summary}${result.coachingSummary ? `\n\n${result.coachingSummary}` : ""}`
            }
            await updateComment(token, payload, thinkingId, thinkingBody)
        }

        // Record usage (non-fatal)
        try {
            await recordUsage({
                orgId: org.id,
                userId: org.id,
                repo: repoFullName,
                model: modelConfig.modelId,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
            })
        } catch (e) {
            console.warn("Usage recording failed:", e)
        }

        // Apply approval workflow for reviews on PRs
        if (subcommand === "review" && payload.issue?.pull_request) {
            try {
                const [owner, repo] = repoFullName.split("/")
                const octokit = new Octokit({ auth: token })
                const repoRecord = await db.query.repos.findFirst({
                    where: eq(repos.fullName, repoFullName),
                })
                const settings = (repoRecord?.settings || {}) as Record<string, any>
                const approvalConfig: ApprovalConfig = {
                    require_archon_approve: settings.require_archon_approve,
                    security_threshold: settings.security_threshold,
                    max_issues_to_merge: settings.max_issues_to_merge,
                    exempt_labels: settings.exempt_labels,
                }
                await applyApprovalWorkflow({
                    octokit,
                    owner,
                    repo,
                    prNumber: issueNumber,
                    verdict: result.verdict,
                    inlineCommentsCount: result.inlineComments.length,
                    securityIssues: result.securityIssues,
                    config: approvalConfig,
                })
            } catch (e) {
                console.warn("Approval workflow failed:", e)
            }
        }

        // Emit integration event
        await emitIntegrationEvent({
            orgId: org.id,
            event: `${subcommand}.completed`,
            data: {
                repo: repoFullName,
                issueNumber,
                verdict: result.verdict,
                summary: result.summary?.substring(0, 500),
                inlineComments: result.inlineComments.length,
                securityIssues: result.securityIssues.length,
            },
        })

        await logEvent(payload, `command_${subcommand}`, "completed", `Verdict: ${result.verdict}`)
        await updateTaskStatus(taskId, "completed", {
            summary: result.summary?.substring(0, 500),
            inputTokens: result.inputTokens, outputTokens: result.outputTokens,
        })
    } catch (err: any) {
        console.error(`Review engine error:`, err)
        if (thinkingId) {
            await updateComment(token, payload, thinkingId,
                `❌ **Archon ${subcommand}** failed: ${err.message}`)
        }
        await logEvent(payload, `command_${subcommand}`, "failed", err.message)
        await updateTaskStatus(taskId, "failed", { error: err.message })
    }
}

async function handlePullRequest(payload: any) {
    const action = payload.action
    const pr = payload.pull_request
    const repoFullName = payload.repository.full_name
    const installationId = payload.installation?.id
    if (!installationId || !pr) return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const token = await getInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })
    const [owner, repo] = repoFullName.split("/")

    // ── PR Merged → update project memory ────────────────────────────
    if (action === "closed" && pr.merged) {
        await handleMemoryUpdateOnMerge(payload, org, token, octokit, owner, repo)
        await emitIntegrationEvent({
            orgId: org.id,
            event: "pr.merged",
            data: { repo: repoFullName, prNumber: pr.number, title: pr.title, author: pr.user?.login },
        })
        return
    }

    // ── PR Opened / Synchronized / Reopened ──────────────────────────
    if (!["opened", "synchronize", "reopened"].includes(action)) return

    await logEvent(payload, `pr_${action}`, "processing", `PR #${pr.number}: ${pr.title}`)

    // Fetch PR files
    let files: Array<{ filename: string; status: string; additions: number; deletions: number; patch?: string }> = []
    try {
        const { data } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: pr.number, per_page: 100,
        })
        files = data.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
            patch: f.patch,
        }))
    } catch (e) {
        console.warn("Failed to list PR files:", e)
    }

    const filenames = files.map((f) => f.filename)
    const linesChanged = files.reduce((sum, f) => sum + f.additions + f.deletions, 0)

    // ── Auto-label ───────────────────────────────────────────────────
    if (action === "opened") {
        try {
            const labels = deriveAutoLabels(filenames)
            if (labels.length > 0) {
                await octokit.rest.issues.addLabels({ owner, repo, issue_number: pr.number, labels })
            }
        } catch (e) {
            console.warn("Auto-label failed:", e)
        }
    }

    // ── PR description (only if empty on open) ───────────────────────
    if (action === "opened" && (!pr.body || pr.body.trim().length < 20)) {
        try {
            const description = buildPrDescription({ title: pr.title, files })
            await octokit.rest.pulls.update({ owner, repo, pull_number: pr.number, body: description })
        } catch (e) {
            console.warn("PR description generation failed:", e)
        }
    }

    // ── Risk scoring ─────────────────────────────────────────────────
    try {
        const risk = await calculatePrRiskAndReviewer({
            orgId: org.id,
            repoFullName,
            prNumber: pr.number,
            author: pr.user?.login || "unknown",
            files,
        })

        // Post risk comment for high-risk PRs
        if (risk.level === "high") {
            const riskComment = buildRiskComment(pr.number, pr.user?.login || "unknown", risk)
            await postComment(token, payload, `⚠️ **High Risk PR Detected**\n\n${riskComment}`)
        }

        // Request reviewer if recommended
        if (risk.reviewer && action === "opened") {
            try {
                await octokit.rest.pulls.requestReviewers({
                    owner, repo, pull_number: pr.number, reviewers: [risk.reviewer],
                })
            } catch (e) {
                console.warn(`Failed to request reviewer ${risk.reviewer}:`, e)
            }
        }

        await emitIntegrationEvent({
            orgId: org.id,
            event: "pr.risk_scored",
            data: { repo: repoFullName, prNumber: pr.number, riskScore: risk.score, riskLevel: risk.level, reviewer: risk.reviewer },
        })
    } catch (e) {
        console.warn("Risk scoring failed:", e)
    }

    // ── Dependency audit ─────────────────────────────────────────────
    try {
        const auditMarkdown = buildDependencyAuditMarkdown(pr.number, files)
        if (auditMarkdown) {
            await postComment(token, payload, auditMarkdown)
        }
    } catch (e) {
        console.warn("Dependency audit failed:", e)
    }

    // ── Custom rules (.archon/rules.yml) ─────────────────────────────
    try {
        const prLabels = (pr.labels || []).map((l: any) => typeof l === "string" ? l : l.name || "")
        await applyRepoRules({
            octokit,
            owner,
            repo,
            prNumber: pr.number,
            baseBranch: pr.base?.ref || "main",
            labels: prLabels,
            files: filenames,
            linesChanged,
            headSha: pr.head?.sha || "",
        })
    } catch (e) {
        console.warn("Custom rules failed:", e)
    }

    // ── Auto-review (if enabled in repo settings) ────────────────────
    const repoRecord = await db.query.repos.findFirst({
        where: eq(repos.fullName, repoFullName),
    })
    const settings = (repoRecord?.settings || {}) as Record<string, any>

    if (settings.autoReview) {
        // Check quota before auto-review
        const plan = await getUserPlan(org.id)
        const quota = await checkUserQuota(org.id, plan)
        if (!quota.allowed) {
            await logEvent(payload, "auto_review", "blocked", `Quota exceeded: ${quota.used}/${quota.limit}`)
            return
        }

        const modelConfig = routeToModel(org.plan || "free")
        const focus = Array.isArray(settings.autoReviewFocus) ? settings.autoReviewFocus : ["security", "bugs"]

        // For synchronize events, try incremental review
        let baseSha: string | undefined
        if (action === "synchronize") {
            try {
                const lastSha = await getLastReviewedSha(org.id, repoFullName, pr.number)
                if (lastSha) {
                    baseSha = lastSha
                    console.log(`Incremental review from SHA ${lastSha.substring(0, 7)}`)
                }
            } catch (e) {
                console.warn("Failed to get last reviewed SHA:", e)
            }
        }

        try {
            const result = await runReviewEngine({
                installationId,
                orgId: org.id,
                repoFullName,
                issueNumber: pr.number,
                actionType: "review",
                model: settings.model || modelConfig.modelId,
                provider: modelConfig.provider,
                apiKey: modelConfig.apiKey,
                reviewFocus: focus,
                enableIntentValidation: settings.enableIntentValidation !== false,
                enableAIAudit: settings.enableAIAudit !== false,
                baseSha,
            })

            // Record usage (non-fatal)
            try {
                await recordUsage({
                    orgId: org.id,
                    userId: org.id,
                    repo: repoFullName,
                    model: modelConfig.modelId,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                })
            } catch (e) {
                console.warn("Usage recording failed:", e)
            }

            // Apply approval workflow
            try {
                const approvalConfig: ApprovalConfig = {
                    require_archon_approve: settings.require_archon_approve,
                    security_threshold: settings.security_threshold,
                    max_issues_to_merge: settings.max_issues_to_merge,
                    exempt_labels: settings.exempt_labels,
                }
                await applyApprovalWorkflow({
                    octokit,
                    owner,
                    repo,
                    prNumber: pr.number,
                    verdict: result.verdict,
                    inlineCommentsCount: result.inlineComments.length,
                    securityIssues: result.securityIssues,
                    config: approvalConfig,
                })
            } catch (e) {
                console.warn("Approval workflow failed:", e)
            }

            await emitIntegrationEvent({
                orgId: org.id,
                event: "review.completed",
                data: {
                    repo: repoFullName,
                    prNumber: pr.number,
                    verdict: result.verdict,
                    summary: result.summary?.substring(0, 500),
                    trigger: "auto",
                },
            })

            await logEvent(payload, "auto_review", "completed", `Verdict: ${result.verdict}`)
        } catch (err: any) {
            console.error("Auto-review failed:", err)
            await logEvent(payload, "auto_review", "failed", err.message)
        }
    }

    // ── Auto-triage (if enabled) ─────────────────────────────────────
    if (settings.autoTriage && action === "opened") {
        try {
            const labels = deriveAutoLabels(filenames)
            await logEvent(payload, "auto_triage", "completed", `Labels: ${labels.join(", ")}`)
        } catch (e) {
            console.warn("Auto-triage failed:", e)
        }
    }

    await logEvent(payload, `pr_${action}`, "completed", `PR #${pr.number} processed`)
}

async function handlePullRequestReview(payload: any) {
    const action = payload.action
    if (action !== "submitted") return

    const review = payload.review
    const pr = payload.pull_request
    const installationId = payload.installation?.id
    if (!installationId || !pr || !review) return

    // Skip bot reviews (our own)
    if (review.user?.type === "Bot") return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const repoFullName = payload.repository.full_name

    // Learn from human review: if a human requests changes,
    // update the PR author's developer profile
    const author = pr.user?.login
    const reviewer = review.user?.login
    if (!author || !reviewer) return

    try {
        if (review.state === "changes_requested") {
            const syntheticComment = {
                path: "",
                line: 0,
                side: "RIGHT",
                body: `Human reviewer @${reviewer} requested changes: ${review.body?.substring(0, 200) || "No details"}`,
                severity: "warning",
            }
            await updateDeveloperProfile(org.id, author, repoFullName, pr.number, [syntheticComment], [])
        }

        // Positive reinforcement from approved reviews
        if (review.state === "approved" && review.body && review.body.trim().length > 10) {
            await recordPositiveReinforcement(org.id, author, repoFullName, pr.number, review.body)
        }

        // Learn reviewer preferences from review comments
        if (review.state === "changes_requested" || review.state === "commented") {
            try {
                const token = await getInstallationToken(installationId)
                const reviewOctokit = new Octokit({ auth: token })
                const [owner, repo] = repoFullName.split("/")

                const { data: reviewComments } = await reviewOctokit.rest.pulls.listReviewComments({
                    owner, repo, pull_number: pr.number, per_page: 50,
                })

                const thisReviewerComments = reviewComments.filter(
                    (c: any) => c.user?.login === reviewer
                )

                if (thisReviewerComments.length > 0) {
                    await learnReviewerPreferences(org.id, repoFullName, reviewer, thisReviewerComments)
                }
            } catch (e) {
                console.warn("Failed to learn reviewer preferences:", e)
            }
        }

        await emitIntegrationEvent({
            orgId: org.id,
            event: "human_review.submitted",
            data: {
                repo: repoFullName,
                prNumber: pr.number,
                reviewer,
                state: review.state,
            },
        })
    } catch (e) {
        console.warn("Learning from human review failed:", e)
    }
}

async function handleCheckSuite(payload: any) {
    const action = payload.action
    if (action !== "completed") return

    const checkSuite = payload.check_suite
    const installationId = payload.installation?.id
    if (!installationId || !checkSuite) return

    // Only analyze failures
    if (checkSuite.conclusion !== "failure") return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const repoFullName = payload.repository.full_name
    const [owner, repo] = repoFullName.split("/")
    const token = await getInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })

    // Find associated PR
    const prs = checkSuite.pull_requests || []
    const prNumber = prs.length > 0 ? prs[0].number : undefined

    try {
        const analysis = await buildCiFailureAnalysis({
            octokit,
            owner,
            repo,
            ref: checkSuite.head_sha,
            prNumber,
        })

        // Post CI analysis as comment if there's a PR
        if (prNumber && analysis.includes("Detected failing checks")) {
            await octokit.rest.issues.createComment({
                owner, repo, issue_number: prNumber,
                body: `🔴 **Archon CI Analysis**\n\n${analysis}`,
            })
        }

        await emitIntegrationEvent({
            orgId: org.id,
            event: "ci.failure_analyzed",
            data: { repo: repoFullName, ref: checkSuite.head_sha, prNumber, analysis: analysis.substring(0, 500) },
        })

        await logEvent(payload, "ci_failure_analysis", "completed", `SHA: ${checkSuite.head_sha}`)
    } catch (e) {
        console.warn("CI failure analysis failed:", e)
    }
}

async function handleRelease(payload: any) {
    const action = payload.action
    if (action !== "published") return

    const release = payload.release
    const installationId = payload.installation?.id
    if (!installationId || !release) return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const repoFullName = payload.repository.full_name
    const [owner, repo] = repoFullName.split("/")
    const token = await getInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })

    try {
        const { notes, prCount } = await generateAndStoreReleaseNotes({
            octokit,
            orgId: org.id,
            owner,
            repo,
            tagName: release.tag_name,
        })

        // Append generated notes to the release body
        if (notes && release.id) {
            const existingBody = release.body || ""
            const newBody = existingBody
                ? `${existingBody}\n\n---\n\n${notes}`
                : notes
            await octokit.rest.repos.updateRelease({
                owner, repo, release_id: release.id,
                body: newBody,
            })
        }

        await emitIntegrationEvent({
            orgId: org.id,
            event: "release.notes_generated",
            data: { repo: repoFullName, tag: release.tag_name, prCount },
        })

        await logEvent(payload, "release_notes", "completed", `Tag: ${release.tag_name}, ${prCount} PRs`)
    } catch (e) {
        console.warn("Release notes generation failed:", e)
    }
}

async function handleInstallation(payload: any) {
    const action = payload.action
    const installation = payload.installation
    if (!installation) return

    if (action === "created") {
        const login = installation.account?.login || "unknown"
        const accountId = String(installation.account?.id || "")

        // Upsert organization
        const existing = await db.query.organizations.findFirst({
            where: eq(organizations.id, accountId),
        })
        if (!existing) {
            await db.insert(organizations).values({
                id: accountId,
                githubLogin: login,
                installationId: installation.id,
                plan: "free",
            })
        } else {
            await db.update(organizations)
                .set({ installationId: installation.id })
                .where(eq(organizations.id, accountId))
        }

        // Sync repositories
        const repositories = payload.repositories || []
        for (const r of repositories) {
            const repoId = String(r.id)
            const existingRepo = await db.query.repos.findFirst({
                where: eq(repos.id, repoId),
            })
            if (!existingRepo) {
                await db.insert(repos).values({
                    id: repoId,
                    orgId: accountId,
                    fullName: r.full_name,
                    isActive: true,
                    settings: {},
                })
            }
        }

        console.log(`Installation created for ${login} (${accountId}), ${repositories.length} repos synced`)
    } else if (action === "deleted") {
        if (installation.id) {
            await db.update(organizations)
                .set({ installationId: null })
                .where(eq(organizations.installationId, installation.id))
        }
        console.log(`Installation deleted: ${installation.id}`)
    }
}

async function handleInstallationRepositories(payload: any) {
    const installationId = payload.installation?.id
    if (!installationId) return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const added = payload.repositories_added || []
    const removed = payload.repositories_removed || []

    for (const r of added) {
        const repoId = String(r.id)
        const existing = await db.query.repos.findFirst({
            where: eq(repos.id, repoId),
        })
        if (!existing) {
            await db.insert(repos).values({
                id: repoId,
                orgId: org.id,
                fullName: r.full_name,
                isActive: true,
                settings: {},
            })
        }
    }

    for (const r of removed) {
        const repoId = String(r.id)
        await db.update(repos)
            .set({ isActive: false })
            .where(eq(repos.id, repoId))
    }

    console.log(`Installation repos updated: +${added.length} / -${removed.length}`)
}

// ── Label-based triggering ──────────────────────────────────────────

async function handleIssuesEvent(payload: any) {
    // Auto-triage new issues
    if (payload.action === "opened") {
        await handleIssueTriage(payload)
        return
    }

    if (payload.action !== "labeled") return

    const label = payload.label
    if (!label || label.name.toLowerCase() !== "archon") return

    const issue = payload.issue
    const installationId = payload.installation?.id
    const repoFullName = payload.repository.full_name
    if (!installationId || !issue) return

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const plan = await getUserPlan(org.id)
    const quota = await checkUserQuota(org.id, plan)
    if (!quota.allowed) {
        const token = await getInstallationToken(installationId)
        await postComment(token, payload,
            `⚠️ **Quota exceeded.** You've used ${quota.used}/${quota.limit} requests this month on the **${plan.name}** plan.`)
        return
    }

    const isPR = !!issue.pull_request
    const actionType = isPR ? "review" : "resolve"
    const modelConfig = routeToModel(org.plan || "free")
    const token = await getInstallationToken(installationId)
    const triggeredBy = payload.sender?.login

    await logEvent(payload, `label_trigger_${actionType}`, "processing",
        `Label "archon" added to ${isPR ? "PR" : "issue"} #${issue.number}`)

    const thinkingId = await postComment(token, payload,
        `🏷️ **Archon v2** triggered by label — running \`${actionType}\` on this ${isPR ? "PR" : "issue"}...`)

    try {
        const result = await runReviewEngine({
            installationId,
            orgId: org.id,
            repoFullName,
            issueNumber: issue.number,
            actionType,
            model: modelConfig.modelId,
            provider: modelConfig.provider,
            apiKey: modelConfig.apiKey,
            requestedBy: triggeredBy,
            reviewFocus: ["security", "bugs", "performance", "style"],
            enableIntentValidation: isPR,
            enableAIAudit: isPR,
        })

        if (thinkingId && result.summary) {
            await updateComment(token, payload, thinkingId,
                `✅ **Archon ${actionType}** completed (triggered by label).\n\n${result.summary}${result.coachingSummary ? `\n\n${result.coachingSummary}` : ""}`)
        }

        try {
            await recordUsage({
                orgId: org.id, userId: org.id, repo: repoFullName,
                model: modelConfig.modelId,
                inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            })
        } catch (e) {
            console.warn("Usage recording failed:", e)
        }

        await logEvent(payload, `label_trigger_${actionType}`, "completed", `Verdict: ${result.verdict}`)
    } catch (err: any) {
        console.error("Label-triggered review failed:", err)
        if (thinkingId) {
            await updateComment(token, payload, thinkingId,
                `❌ **Archon ${actionType}** failed: ${err.message}`)
        }
        await logEvent(payload, `label_trigger_${actionType}`, "failed", err.message)
    }
}

// ── Auto-triage new issues ───────────────────────────────────────────
async function handleIssueTriage(payload: any) {
    const installationId = payload.installation?.id
    const issue = payload.issue
    if (!installationId || !issue) return

    // Only triage if auto-review is enabled for this repo
    const repoFullName = payload.repository.full_name
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const repoRecord = await db.query.repos.findFirst({
        where: eq(repos.fullName, repoFullName),
    })
    const settings = (repoRecord?.settings as any) || {}
    if (!settings.autoReview && !settings.autoTriage) return  // only triage if opted in

    const token = await getInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })
    const [owner, repo] = repoFullName.split("/")

    try {
        // Derive labels from issue title + body keywords
        const titleAndBody = `${issue.title} ${issue.body || ""}`
        const suggestedLabels: string[] = []

        // Keyword-based label derivation
        const lower = titleAndBody.toLowerCase()
        if (lower.includes("bug") || lower.includes("error") || lower.includes("crash") || lower.includes("fail")) suggestedLabels.push("bug")
        if (lower.includes("feature") || lower.includes("enhancement") || lower.includes("add") || lower.includes("request")) suggestedLabels.push("enhancement")
        if (lower.includes("doc") || lower.includes("readme") || lower.includes("documentation")) suggestedLabels.push("documentation")
        if (lower.includes("security") || lower.includes("vulnerab") || lower.includes("cve") || lower.includes("auth")) suggestedLabels.push("security")
        if (lower.includes("performance") || lower.includes("slow") || lower.includes("memory") || lower.includes("leak")) suggestedLabels.push("performance")
        if (lower.includes("test") || lower.includes("spec") || lower.includes("coverage")) suggestedLabels.push("testing")
        if (lower.includes("question") || lower.includes("how to") || lower.includes("help")) suggestedLabels.push("question")

        // Apply labels (create if needed, skip errors)
        for (const labelName of suggestedLabels.slice(0, 3)) {
            try {
                // Ensure label exists
                await octokit.rest.issues.createLabel({ owner, repo, name: labelName, color: "0075ca" }).catch(() => { })
                await octokit.rest.issues.addLabels({ owner, repo, issue_number: issue.number, labels: [labelName] })
            } catch { /* label may already exist */ }
        }

        await logEvent(payload, "issue_triage", "completed",
            suggestedLabels.length > 0 ? `Auto-labeled: ${suggestedLabels.join(", ")}` : "No labels applied")
    } catch (err: any) {
        console.warn("Issue auto-triage failed (non-fatal):", err.message)
    }
}

// ── Memory update on merge ───────────────────────────────────────────
// ── Push to default branch → incremental memory update ──────────────
async function handlePush(payload: any) {
    const repoFullName: string = payload.repository?.full_name
    const ref: string = payload.ref || ""
    const defaultBranch: string = payload.repository?.default_branch || "main"

    // Only handle pushes to the default branch
    if (ref !== `refs/heads/${defaultBranch}`) return
    if (!payload.installation?.id || !repoFullName) return

    // Collect all changed files across all commits in this push
    const changedFiles: string[] = (payload.commits || []).flatMap((c: any) => [
        ...(c.added || []),
        ...(c.modified || []),
        ...(c.removed || []),
    ])
    if (changedFiles.length === 0) return

    const installationId = payload.installation.id
    const [owner, repo] = repoFullName.split("/")

    // Look up org and repo record
    const org = await db.query.organizations.findFirst({
        where: eq(organizations.installationId, installationId),
    })
    if (!org) return

    const repoRecord = await db.query.repos.findFirst({
        where: eq(repos.fullName, repoFullName),
    })
    if (!repoRecord) return

    let token: string
    try {
        token = await getInstallationToken(installationId)
    } catch (err: any) {
        console.warn(`Push handler: failed to get token for ${repoFullName}: ${err.message}`)
        return
    }
    const octokit = new Octokit({ auth: token })

    // Skip if memory doesn't exist yet — user hasn't run /archon analyze
    const memory = await loadProjectMemory(octokit, owner, repo)
    if (!memory) return

    const settings = (repoRecord.settings as Record<string, any>) || {}
    const prevCount = (settings.memoryFilesChangedSince as number) || 0
    const newCount = prevCount + changedFiles.length

    // Auto-rebuild if 50+ files changed since last full scan
    if (newCount >= 50) {
        console.log(`[push] Auto-rebuilding memory for ${repoFullName} (${newCount} files changed since last full scan)`)
        // Reset counter immediately before async rebuild
        await db.update(repos)
            .set({ settings: { ...settings, memoryFilesChangedSince: 0 } })
            .where(eq(repos.fullName, repoFullName))

            // Fire-and-forget full rebuild
            ; (async () => {
                try {
                    const modelConfig = routeToModel(org.plan || "free")
                    await runFullProjectAnalysis(
                        octokit, owner, repo,
                        modelConfig.provider, modelConfig.apiKey, modelConfig.modelId,
                        callAI,
                    )
                    console.log(`[push] Auto-rebuild complete for ${repoFullName}`)
                } catch (err: any) {
                    console.error(`[push] Auto-rebuild failed for ${repoFullName}: ${err.message}`)
                }
            })()
        return
    }

    // Increment counter in settings
    await db.update(repos)
        .set({ settings: { ...settings, memoryFilesChangedSince: newCount } })
        .where(eq(repos.fullName, repoFullName))

    // Incremental update only if important structural files changed
    const importantPatterns = /package\.json|schema|config|\.env\.example|tsconfig|docker|readme/i
    const hasImportantChanges = changedFiles.some(f => importantPatterns.test(f))
    if (!hasImportantChanges) return

        ; (async () => {
            try {
                const modelConfig = routeToModel(org.plan || "free")
                await updateMemoryOnMerge(
                    octokit, owner, repo,
                    changedFiles, 0,
                    modelConfig.provider, modelConfig.apiKey, modelConfig.modelId,
                    callAI,
                )
                console.log(`[push] Memory incrementally updated for ${repoFullName} (${changedFiles.length} files, counter: ${newCount}/50)`)
            } catch (err: any) {
                console.warn(`[push] Memory update failed for ${repoFullName}: ${err.message}`)
            }
        })()
}

async function handleMemoryUpdateOnMerge(
    payload: any,
    org: any,
    _token: string,
    octokit: Octokit,
    owner: string,
    repo: string,
) {
    const pr = payload.pull_request
    if (!pr) return

    try {
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: pr.number, per_page: 100,
        })

        const importantPatterns = /package\.json|schema|config|\.env\.example|tsconfig|docker|readme/i
        const hasImportantChanges = files.some((f) => importantPatterns.test(f.filename))

        if (hasImportantChanges) {
            const modelConfig = routeToModel(org.plan || "free")
            await updateMemoryOnMerge(
                octokit, owner, repo,
                files.map((f) => f.filename),
                pr.number,
                modelConfig.provider, modelConfig.apiKey, modelConfig.modelId,
                callAI,
            )
            console.log(`Project memory updated after PR #${pr.number} merge`)
        }
    } catch (e) {
        console.warn("Memory update on merge failed:", e)
    }
}

// ── Helpers ──────────────────────────────────────────────────────────
async function logEvent(payload: any, eventType: string, status: string, message: string) {
    try {
        const repoFullName = payload.repository?.full_name || "unknown"
        const issueNumber = payload.issue?.number || payload.pull_request?.number || null
        const installationId = payload.installation?.id

        let orgId: string | null = null
        if (installationId) {
            const org = await db.query.organizations.findFirst({
                where: eq(organizations.installationId, installationId),
            })
            orgId = org?.id || null
        }

        await db.insert(eventLogs).values({
            id: crypto.randomUUID(),
            orgId,
            repo: repoFullName,
            eventType,
            issueNumber,
            status,
            message,
        })
    } catch (e) {
        console.warn("Event logging failed:", e)
    }
}

// ── Feedback Learning: handle reactions/replies on Archon comments ───

async function handleReviewCommentFeedback(payload: any) {
    const action = payload.action  // "created" for new reply comments
    const comment = payload.comment
    const repo = payload.repository

    if (!comment || !repo) return

    // Only process replies to Archon bot comments
    const isReplyToArchon = comment.in_reply_to_id && comment.body
    if (!isReplyToArchon) return

    // Check if the parent comment was by our bot
    const botLogin = "archon-org[bot]"
    const isBotComment = comment.user?.login === botLogin
    if (isBotComment) return // Don't process bot's own comments

    // Get org info
    const orgId = String(repo.owner?.id || repo.owner?.login || "")
    const repoFullName = repo.full_name

    try {
        // Fetch the parent comment to check if it's from Archon
        const installationId = payload.installation?.id
        if (!installationId) return

        const token = await getInstallationToken(installationId)
        const octokit = new Octokit({ auth: token })

        let parentBody = ''
        try {
            const { data: parentComment } = await octokit.rest.pulls.getReviewComment({
                owner: repo.owner.login,
                repo: repo.name,
                comment_id: comment.in_reply_to_id,
            })
            if (parentComment.user?.login !== botLogin) return
            parentBody = parentComment.body || ''
        } catch {
            return // Can't verify parent
        }

        // Process the reply as feedback
        await processReply(
            orgId,
            repoFullName,
            parentBody,
            comment.body,
            comment.path
        )

        console.log(`Feedback learning: processed reply from @${comment.user?.login} on ${repoFullName}`)
    } catch (err: any) {
        console.warn(`Feedback learning error: ${err.message}`)
    }
}

export default webhook
