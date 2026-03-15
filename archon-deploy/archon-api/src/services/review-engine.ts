/**
 * Server-side review engine.
 * Replaces the GitHub Actions dispatch approach — runs review, intent validation,
 * and AI audit directly in the API process using the installation token.
 */
import { Octokit } from "@octokit/rest"
import { getInstallationToken } from "./github.js"
import { getDeveloperProfile, updateDeveloperProfile, buildCoachingPromptContextWithPreferences } from "./coaching.js"
import { buildMemoryPromptContext, runFullProjectAnalysis, updateMemoryWithReview, getMemoryStaleness, loadMemoryHierarchy } from "./project-memory.js"
import { loadRepoMap, generateRepoMap, saveRepoMap, buildRepoMapContext } from "./repo-map.js"
import { runStaticScan, buildStaticFindingsContext } from "./static-scanner.js"
import { loadRelevantLearnings } from "./feedback-learning.js"
import { buildComplexityReport, detectTestCoverageGaps, buildTestCoverageReport, detectDeadExports } from "./code-quality.js"
import { loadPathInstructions, buildPathInstructionsContext, selfCheckReview, triageReview, findSimilarPatterns } from "./review-pipeline.js"
import { notifyReviewComplete } from "./notifications.js"
import { db } from "../db/client.js"
import { reviewResults, eventLogs, analyticsEvents } from "../db/schema.js"
import { eq, and } from "drizzle-orm"
import { routeToCheapModel } from "./ai-proxy.js"

// ── Extracted modules ────────────────────────────────────────────────
import type { PRContext, ReviewResult, ReviewEngineOptions } from "./review-engine/types.js"
export type { ReviewResult, ReviewEngineOptions } from "./review-engine/types.js"
import { REVIEW_PROMPT, SECURITY_PROMPT } from "./review-engine/prompts.js"
import { callAI } from "./review-engine/ai-client.js"
export { callAI } from "./review-engine/ai-client.js"
import { fetchPRContext, fetchIncrementalDiff, fetchLinkedIssue } from "./review-engine/pr-context.js"
export { getLastReviewedSha } from "./review-engine/pr-context.js"
import { postReviewToGitHub } from "./review-engine/github-ops.js"
import { runCodeReview } from "./review-engine/review-handler.js"
import { runExplain, generatePRSummary, generateFullDiagram, runIssueAnalysis, runIntentValidation, runAICodeAudit, runTestGeneration, runDocsGeneration } from "./review-engine/utility-handlers.js"
import { runPRResolution, runIssueResolution, runFeedbackFix } from "./review-engine/resolve-handler.js"
import { runFullSecurityReport } from "./review-engine/security-handler.js"
import { runFullTechnicalReview, runComprehensiveSecurityAudit } from "./review-engine/technical-review-handler.js"
// ── Core Engine ───────────────────────────────────────────────────────

export async function runReviewEngine(options: ReviewEngineOptions): Promise<ReviewResult> {
    const {
        installationId, orgId, repoFullName, issueNumber,
        actionType, model, provider, apiKey, commentId, requestedBy,
        reviewFocus = ['security', 'bugs', 'style', 'performance'],
        enableIntentValidation = true, enableAIAudit = true, baseSha,
        taskId,
    } = options

    // Progress updater for long-running tasks — updates tasks.summary with current stage
    const updateProgress = taskId
        ? async (stage: string, current: number, total: number, currentFile?: string) => {
            try {
                const { tasks: tasksTable } = await import("../db/schema.js")
                await db.update(tasksTable)
                    .set({ summary: JSON.stringify({ stage, current, total, currentFile: currentFile || null }) })
                    .where(eq(tasksTable.id, taskId))
            } catch { /* non-fatal */ }
        }
        : async (_s: string, _c: number, _t: number, _f?: string) => { }

    const [owner, repo] = repoFullName.split('/')
    const token = await getInstallationToken(installationId)
    const octokit = new Octokit({ auth: token })

    // Create review_result record in "running" state
    const reviewId = crypto.randomUUID()
    await db.insert(reviewResults).values({
        id: reviewId,
        orgId,
        repo: repoFullName,
        issueNumber,
        actionType,
        status: 'running',
    })

    try {
        // Check if this is a PR or just an issue (skip for frontend-triggered actions with no PR/issue)
        let issue: { pull_request?: any } = {}
        if (issueNumber > 0) {
            const { data } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })
            issue = data
        }

        // ── Resolve mode ──────────────────────────────────────────
        if (actionType === 'resolve') {
            let result: ReviewResult
            if (!issue.pull_request) {
                // Resolve from issue: analyze issue → generate fix → create PR
                result = await runIssueResolution(octokit, owner, repo, issueNumber, provider, apiKey, model, requestedBy)
            } else {
                // Resolve from PR: analyze PR code → generate fixes → push to new branch → open fix PR
                const prContext = await fetchPRContext(octokit, owner, repo, issueNumber)
                result = await runPRResolution(octokit, owner, repo, prContext, provider, apiKey, model, requestedBy)
            }

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: result.summary,
                    verdict: result.verdict,
                    filesReviewed: result.filesReviewed,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    resultData: {
                        branchName: result.branchName,
                        prNumber: result.prNumber,
                        filesModified: result.filesModified,
                    },
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            console.log(`Resolve completed for ${repoFullName}#${issueNumber}: branch=${result.branchName}, PR=#${result.prNumber}`)
            return result
        }

        // ── Fix mode: fix review feedback on PR ─────────────────
        if (actionType === 'fix' || actionType === 'all') {
            if (!issue.pull_request) {
                return {
                    summary: '`/archon fix` and `/archon all` can only be used on pull requests.',
                    verdict: 'COMMENT',
                    inlineComments: [], securityIssues: [],
                    filesReviewed: 0, inputTokens: 0, outputTokens: 0,
                }
            }

            const result = await runFeedbackFix(
                octokit, owner, repo, issueNumber,
                actionType === 'all',
                provider, apiKey, model, requestedBy
            )

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: result.summary,
                    verdict: result.verdict,
                    filesReviewed: result.filesReviewed,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    resultData: { filesModified: result.filesModified },
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            return result
        }

        // ── Tests mode: generate test cases for PR — Feature 4.1 ────
        if (actionType === 'tests') {
            if (!issue.pull_request) {
                return {
                    summary: '`/archon tests` can only be used on pull requests.',
                    verdict: 'COMMENT', inlineComments: [], securityIssues: [],
                    filesReviewed: 0, inputTokens: 0, outputTokens: 0,
                }
            }

            const prContext = await fetchPRContext(octokit, owner, repo, issueNumber)
            const testResult = await runTestGeneration(
                octokit, owner, repo, prContext, provider, apiKey, model, requestedBy
            )

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: testResult.summary,
                    verdict: 'COMMENT',
                    filesReviewed: testResult.filesReviewed,
                    inputTokens: testResult.inputTokens,
                    outputTokens: testResult.outputTokens,
                    resultData: { branchName: testResult.branchName, prNumber: testResult.prNumber, filesModified: testResult.filesModified },
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            return testResult
        }

        // ── Diagram mode: generate full project/PR Mermaid diagram ────
        if (actionType === 'diagram') {
            console.log(`Generating full Mermaid diagram for ${repoFullName}...`)
            const diagramResult = await generateFullDiagram(
                octokit, owner, repo, issueNumber,
                provider, apiKey, model, issue.pull_request ? true : false
            )

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: diagramResult.summary.substring(0, 5000),
                    verdict: 'COMMENT',
                    inputTokens: diagramResult.inputTokens,
                    outputTokens: diagramResult.outputTokens,
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            return diagramResult
        }

        // ── Full Technical Review mode: comprehensive LE-style technical audit ──
        if (actionType === 'full-review') {
            console.log(`Running full technical review for ${repoFullName}...`)
            const reviewResult = await runFullTechnicalReview(
                octokit, owner, repo, provider, apiKey, model, requestedBy, updateProgress
            )
            await db.update(reviewResults).set({
                status: 'completed',
                summary: reviewResult.summary.substring(0, 5000),
                verdict: 'COMMENT',
                filesReviewed: reviewResult.filesReviewed,
                inputTokens: reviewResult.inputTokens,
                outputTokens: reviewResult.outputTokens,
                resultData: reviewResult.fullReport ? { fullReport: reviewResult.fullReport } : undefined,
                completedAt: new Date(),
            }).where(eq(reviewResults.id, reviewId))
            return reviewResult
        }

        // ── Comprehensive Security Audit mode ─────────────────────────────────
        if (actionType === 'security-audit') {
            console.log(`Running comprehensive security audit for ${repoFullName}...`)
            const auditResult = await runComprehensiveSecurityAudit(
                octokit, owner, repo, provider, apiKey, model, requestedBy, updateProgress
            )
            await db.update(reviewResults).set({
                status: 'completed',
                summary: auditResult.summary.substring(0, 5000),
                verdict: 'COMMENT',
                filesReviewed: auditResult.filesReviewed,
                inputTokens: auditResult.inputTokens,
                outputTokens: auditResult.outputTokens,
                resultData: auditResult.fullReport ? { fullReport: auditResult.fullReport } : undefined,
                completedAt: new Date(),
            }).where(eq(reviewResults.id, reviewId))
            return auditResult
        }

        // ── Analyze mode: full project scan + memory + repo map creation ────
        if (actionType === 'analyze') {
            console.log(`Running full project analysis for ${repoFullName}...`)
            const analysis = await runFullProjectAnalysis(
                octokit, owner, repo, provider, apiKey, model, callAI
            )

            // Also generate repo map — Feature 1.1
            let repoMapInfo = ''
            try {
                console.log('Generating repo map...')
                const newRepoMap = await generateRepoMap(octokit, owner, repo)
                await saveRepoMap(octokit, owner, repo, newRepoMap)
                repoMapInfo = `\n- **Repo map:** ${newRepoMap.files.length} source files indexed with import graph`
                console.log(`Repo map generated: ${newRepoMap.files.length} files, ${Object.keys(newRepoMap.importGraph).length} import links`)
            } catch (err: any) {
                console.warn(`Repo map generation failed (non-fatal): ${err.message}`)
            }

            const summary = `## Archon Project Analysis\n\nFull project scan complete. Memory file created at \`.archon/memory.md\`.\n\nArchon will now use this knowledge in every future review to give context-aware feedback.\n\n**What's in the memory:**\n- Project overview & architecture\n- Tech stack & dependencies\n- Files to always check\n- Architecture decisions${repoMapInfo}\n\n**What happens next:**\n- Every \`/archon review\` will read this memory first\n- New conventions learned from reviews will be added automatically\n- When you merge PRs that change important files, the memory updates automatically\n- You can edit \`.archon/memory.md\` to add team rules in the **Manual Overrides** section\n- Use \`review_instructions\` in \`.archon/rules.yml\` to add path-scoped review rules\n\n---\n\n<details><summary>View generated memory</summary>\n\n${analysis.memory}\n\n</details>`

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: summary.substring(0, 5000),
                    verdict: 'COMMENT',
                    inputTokens: analysis.inputTokens,
                    outputTokens: analysis.outputTokens,
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            return {
                summary, verdict: 'COMMENT',
                inlineComments: [], securityIssues: [],
                filesReviewed: 0,
                inputTokens: analysis.inputTokens,
                outputTokens: analysis.outputTokens,
            }
        }

        // ── Report mode: full LE-style security & technical review ─────────
        if (actionType === 'report') {
            let prCtx: PRContext | undefined
            if (issue.pull_request) {
                try { prCtx = await fetchPRContext(octokit, owner, repo, issueNumber) }
                catch (err: any) { console.warn(`PR context fetch failed: ${err.message}`) }
            }
            const reportResult = await runFullSecurityReport(
                octokit, owner, repo, issueNumber,
                provider, apiKey, model, requestedBy, prCtx
            )
            await db.update(reviewResults).set({
                status: 'completed',
                summary: reportResult.summary.substring(0, 5000),
                verdict: 'COMMENT',
                filesReviewed: reportResult.filesReviewed,
                inputTokens: reportResult.inputTokens,
                outputTokens: reportResult.outputTokens,
                resultData: reportResult.fullReport ? { fullReport: reportResult.fullReport } : undefined,
                completedAt: new Date(),
            }).where(eq(reviewResults.id, reviewId))
            return reportResult
        }

        // ── Docs mode: generate project documentation ────────────────
        if (actionType === 'docs') {
            const docsResult = await runDocsGeneration(
                octokit, owner, repo, issue.pull_request ? issueNumber : null,
                provider, apiKey, model, requestedBy
            )

            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: docsResult.summary.substring(0, 5000),
                    verdict: 'COMMENT',
                    inputTokens: docsResult.inputTokens,
                    outputTokens: docsResult.outputTokens,
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))

            return docsResult
        }

        // ── Frontend security scan (no PR/issue): full LE-style report ──────
        if (actionType === 'security' && issueNumber === 0) {
            const reportResult = await runFullSecurityReport(
                octokit, owner, repo, 0,
                provider, apiKey, model, requestedBy
            )
            await db.update(reviewResults).set({
                status: 'completed',
                summary: reportResult.summary.substring(0, 5000),
                verdict: 'COMMENT',
                filesReviewed: reportResult.filesReviewed,
                inputTokens: reportResult.inputTokens,
                outputTokens: reportResult.outputTokens,
                resultData: reportResult.fullReport ? { fullReport: reportResult.fullReport } : undefined,
                completedAt: new Date(),
            }).where(eq(reviewResults.id, reviewId))
            return reportResult
        }

        if (!issue.pull_request) {
            // GitHub issue with /archon command — hybrid analysis using issue as context
            const result = await runIssueAnalysis(octokit, owner, repo, issueNumber, provider, apiKey, model, actionType, requestedBy)
            await db.update(reviewResults)
                .set({
                    status: 'completed',
                    summary: result.summary.substring(0, 5000),
                    verdict: 'COMMENT',
                    filesReviewed: result.filesReviewed,
                    securityIssuesCount: result.securityIssues.length || null,
                    inlineCommentsCount: result.inlineComments.length || null,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    resultData: (result.securityIssues.length > 0 || result.inlineComments.length > 0)
                        ? { securityIssues: result.securityIssues, inlineComments: result.inlineComments }
                        : undefined,
                    completedAt: new Date(),
                })
                .where(eq(reviewResults.id, reviewId))
            return result
        }

        // ── SHA-based dedup guard — skip if we already reviewed this exact commit ──
        if (!baseSha) {
            try {
                const { data: prHead } = await octokit.rest.pulls.get({ owner, repo, pull_number: issueNumber })
                const currentSha = prHead.head.sha
                const alreadyReviewed = await db.query.reviewResults.findFirst({
                    where: and(
                        eq(reviewResults.repo, repoFullName),
                        eq(reviewResults.issueNumber, issueNumber),
                        eq(reviewResults.headSha, currentSha),
                        eq(reviewResults.status, 'completed'),
                        eq(reviewResults.actionType, actionType),
                    ),
                })
                if (alreadyReviewed) {
                    console.log(`Skipping duplicate review for ${repoFullName}#${issueNumber} at SHA ${currentSha.substring(0, 7)} (already reviewed)`)
                    await db.update(reviewResults).set({ status: 'completed', summary: 'Duplicate review skipped — this commit was already reviewed.', completedAt: new Date() }).where(eq(reviewResults.id, reviewId))
                    return {
                        summary: `> ℹ️ This commit has already been reviewed by Archon. No duplicate review necessary.`,
                        verdict: 'COMMENT',
                        inlineComments: [], securityIssues: [],
                        filesReviewed: 0, inputTokens: 0, outputTokens: 0,
                    }
                }
            } catch { /* non-fatal — proceed with review if dedup check fails */ }
        }

        // Fetch PR context (full or incremental)
        let prContext: PRContext
        let isIncremental = false

        if (baseSha) {
            try {
                console.log(`Attempting incremental review from SHA ${baseSha.substring(0, 7)}...`)
                const incrementalCtx = await fetchIncrementalDiff(octokit, owner, repo, issueNumber, baseSha)
                if (incrementalCtx && incrementalCtx.filesChanged.length > 0) {
                    prContext = incrementalCtx
                    isIncremental = true
                    console.log(`Incremental review: ${prContext.filesChanged.length} files changed since ${baseSha.substring(0, 7)}`)
                } else {
                    console.log('No incremental changes found, falling back to full review')
                    prContext = await fetchPRContext(octokit, owner, repo, issueNumber)
                }
            } catch (err: any) {
                console.warn(`Incremental diff failed (likely force push): ${err.message}. Falling back to full review.`)
                prContext = await fetchPRContext(octokit, owner, repo, issueNumber)
            }
        } else {
            console.log(`Fetching PR #${issueNumber} context for ${repoFullName}...`)
            prContext = await fetchPRContext(octokit, owner, repo, issueNumber)
        }

        // ── Phase 1: Load all context (memory, repo map, coaching, learnings) ──
        console.log(`Loading project context for ${repoFullName}...`)
        const changedPaths = prContext.filesChanged.map(f => f.filename)

        // Load memory hierarchy (root + scoped for monorepos) — Feature 2.3
        const projectMemory = await loadMemoryHierarchy(octokit, owner, repo, changedPaths)
        // Truncate memory to prevent prompt budget overflow (memory grows over time)
        const memoryTruncated = projectMemory && projectMemory.length > 30000
            ? projectMemory.substring(0, 30000) + '\n\n[... memory truncated to fit prompt budget. Run /archon analyze to rebuild ...]'
            : projectMemory
        const memoryContext = buildMemoryPromptContext(memoryTruncated)
        if (projectMemory) {
            const staleness = getMemoryStaleness(projectMemory)
            console.log(`Project memory loaded (last scan: ${staleness.lastScan}, ${staleness.daysSince} days ago, ${projectMemory.length} chars${projectMemory.length > 30000 ? ' — truncated' : ''})`)
        } else {
            console.log(`No project memory found — run /archon analyze to create one`)
        }

        // Load repo map — Feature 1.1
        let repoMap = await loadRepoMap(octokit, owner, repo)
        const repoMapContext = repoMap ? buildRepoMapContext(repoMap, changedPaths) : ''
        if (repoMap) console.log(`Repo map loaded (${repoMap.files.length} files)`)

        // Fetch developer profile for coaching
        console.log(`Fetching developer profile for @${prContext.author}...`)
        const devProfile = await getDeveloperProfile(orgId, prContext.author)
        const coachingContext = await buildCoachingPromptContextWithPreferences(devProfile, orgId)

        // Load feedback learnings — Feature 2.1
        const learningsContext = await loadRelevantLearnings(orgId, repoFullName, changedPaths)
        if (learningsContext) console.log(`Loaded feedback learnings for review context`)

        // Load path-scoped instructions — Feature 1.4
        const pathInstructions = await loadPathInstructions(octokit, owner, repo)
        const pathInstructionsContext = buildPathInstructionsContext(pathInstructions, changedPaths)
        if (pathInstructionsContext) console.log(`Loaded path-scoped instructions for ${pathInstructions.length} patterns`)

        // ── Phase 2: Triage (Progressive Deepening) — use cheap model to save costs ──
        console.log('Running triage assessment...')
        const cheapModel = routeToCheapModel()
        const triage = await triageReview(prContext.title, prContext.filesChanged, cheapModel.provider, cheapModel.apiKey, cheapModel.modelId)
        console.log(`Triage: ${triage.riskLevel} risk, ${triage.reviewDepth} depth — ${triage.reasoning}`)

        // ── Code Quality Metrics — Features 3.1, 3.2, 3.3 ──
        const complexityReport = buildComplexityReport(prContext.filesChanged)
        const testGaps = detectTestCoverageGaps(
            prContext.filesChanged,
            repoMap?.files.map(f => f.path) || []
        )
        const testCoverageReport = buildTestCoverageReport(testGaps)
        const deadCodeReport = detectDeadExports(prContext.filesChanged, repoMap)
        const similarCodeReport = findSimilarPatterns(prContext.filesChanged, repoMap)

        // ── Generate PR Summary with Mermaid diagram (before inline review) ──
        let summaryTokens = { input: 0, output: 0 }
        if (actionType === 'review' || actionType === 'security') {
            try {
                console.log('Generating PR summary with Mermaid diagram...')
                const st = await generatePRSummary(
                    octokit, owner, repo, issueNumber,
                    prContext, provider, apiKey, model,
                    coachingContext, devProfile
                )
                summaryTokens = { input: st.inputTokens, output: st.outputTokens }
            } catch (err: any) {
                console.warn(`PR summary generation failed (non-fatal): ${err.message}`)
            }
        }

        // ── Phase 3: Main Review ──
        let result: ReviewResult

        if (actionType === 'explain') {
            result = await runExplain(prContext, provider, apiKey, model)
        } else {
            // ── Layer 1: Static pattern scan — runs for ALL action types, not just security ──
            // Catches hardcoded secrets, SQLi, SSRF, prototype pollution, etc. at zero AI cost.
            const staticFindings = runStaticScan(prContext.filesChanged)
            if (staticFindings.length > 0) {
                console.log(`Static scan: ${staticFindings.length} pattern matches found across ${new Set(staticFindings.map(f => f.file)).size} files`)
            }
            // For security reviews: findings are injected as primary context (to be confirmed/denied by Claude)
            // For regular reviews: findings are injected silently so Claude can see potential issues
            const staticFindingsContext = buildStaticFindingsContext(staticFindings)

            const basePrompt = actionType === 'security'
                ? SECURITY_PROMPT
                : REVIEW_PROMPT.replace('{focus_areas}',
                    triage.focusAreas.length > 0
                        ? triage.focusAreas.join(', ')
                        : reviewFocus.join(', '))

            // Build enriched system prompt with ALL context layers (Layer 3)
            const systemPrompt = basePrompt
                + staticFindingsContext
                + memoryContext
                + coachingContext
                + learningsContext
                + pathInstructionsContext
                + repoMapContext
                + complexityReport
                + testCoverageReport
                + deadCodeReport
                + similarCodeReport

            // Filter files based on triage skip list — Feature 2.4
            if (triage.skipFiles.length > 0 && triage.reviewDepth === 'quick') {
                const skipSet = new Set(triage.skipFiles)
                prContext.filesChanged = prContext.filesChanged.filter(f => !skipSet.has(f.filename))
                console.log(`Triage: skipped ${triage.skipFiles.length} low-value files`)
            }

            result = await runCodeReview(prContext, systemPrompt, provider, apiKey, model)

            // ── Self-Check Pass — use cheap model to filter false positives ──
            if (result.inlineComments.length > 2) {
                console.log(`Running self-check on ${result.inlineComments.length} comments...`)
                const { filtered, removedCount } = await selfCheckReview(
                    result.inlineComments,
                    prContext.title,
                    prContext.body,
                    learningsContext,
                    cheapModel.provider, cheapModel.apiKey, cheapModel.modelId
                )
                result.inlineComments = filtered
                if (removedCount > 0) {
                    console.log(`Self-check removed ${removedCount} false positives`)
                }
            }

            // Intent Validation — use cheap model (lightweight classification task)
            if (enableIntentValidation) {
                const linkedIssue = await fetchLinkedIssue(octokit, owner, repo, prContext.body, prContext.title)
                if (linkedIssue) {
                    console.log(`Running intent validation against issue #${linkedIssue.number}...`)
                    const intent = await runIntentValidation(prContext, linkedIssue, cheapModel.provider, cheapModel.apiKey, cheapModel.modelId)
                    result.intentAnalysis = intent.analysis
                    result.inputTokens += intent.inputTokens
                    result.outputTokens += intent.outputTokens
                }
            }

            // AI Code Audit — use cheap model (pattern classification task)
            if (enableAIAudit) {
                console.log('Running AI code pattern audit...')
                const audit = await runAICodeAudit(prContext, cheapModel.provider, cheapModel.apiKey, cheapModel.modelId)
                result.aiPatternAnalysis = audit.analysis
                result.inputTokens += audit.inputTokens
                result.outputTokens += audit.outputTokens
            }

            // Verdict escalation
            if (result.intentAnalysis && result.intentAnalysis.score < 40 && result.verdict === 'APPROVE') {
                result.verdict = 'REQUEST_CHANGES'
            }
            if (result.aiPatternAnalysis?.patterns.some(p => p.severity === 'high') && result.verdict === 'APPROVE') {
                result.verdict = 'COMMENT'
            }

            // ── Archon Coach: update developer profile & append learning summary ──
            if (result.inlineComments.length > 0 || result.securityIssues.length > 0) {
                console.log(`Updating developer profile for @${prContext.author}...`)
                try {
                    const coaching = await updateDeveloperProfile(
                        orgId, prContext.author, repoFullName, issueNumber,
                        result.inlineComments, result.securityIssues,
                    )
                    result.coachingSummary = coaching.learningSummary
                    result.summary += coaching.learningSummary
                } catch (err: any) {
                    console.warn(`Coaching update failed (non-fatal): ${err.message}`)
                }
            }

            // ── Append quality metrics to summary ──
            if (testGaps.length > 0) {
                result.summary += `\n\n### Test Coverage Gaps\n`
                for (const gap of testGaps.slice(0, 5)) {
                    if (!gap.testFile) result.summary += `- ⚠️ \`${gap.sourceFile}\`: No test file found\n`
                    else if (!gap.hasTestChanges) result.summary += `- ⚠️ \`${gap.sourceFile}\`: Modified but tests not updated\n`
                    if (gap.newFunctions.length > 0) result.summary += `  New: ${gap.newFunctions.join(', ')}\n`
                }
            }

            // ── Staleness warning ──
            if (projectMemory) {
                const staleness = getMemoryStaleness(projectMemory)
                if (staleness.isStale) {
                    result.summary += `\n\n> ℹ️ Project memory is ${staleness.daysSince} days old. Run \`/archon analyze\` for a fresh full-project scan.`
                }
            } else {
                result.summary += `\n\n> 💡 **Tip:** Run \`/archon analyze\` to create project memory. Archon will learn your codebase and give smarter, context-aware reviews.`
            }

            // ── Triage context in summary ──
            if (triage.riskLevel !== 'medium') {
                result.summary += `\n\n> 📊 Triage: **${triage.riskLevel}** risk (${triage.reviewDepth} review)`
            }

            // ── Update project memory with review learnings ──
            if (projectMemory) {
                try {
                    await updateMemoryWithReview(octokit, owner, repo, {
                        prNumber: issueNumber,
                        verdict: result.verdict,
                        inlineComments: result.inlineComments,
                        securityIssues: result.securityIssues,
                        filesChanged: changedPaths,
                    })
                } catch (err: any) {
                    console.warn(`Memory update failed (non-fatal): ${err.message}`)
                }
            }

            // ── Log analytics event — Feature 4.4 ──
            try {
                await db.insert(analyticsEvents).values({
                    id: crypto.randomUUID(),
                    orgId,
                    repo: repoFullName,
                    eventType: actionType,
                    prNumber: issueNumber,
                    author: prContext.author,
                    verdict: result.verdict,
                    inlineCommentsCount: result.inlineComments.length,
                    securityIssuesCount: result.securityIssues.length,
                    inputTokens: result.inputTokens,
                    outputTokens: result.outputTokens,
                    testCoverageGaps: testGaps.length,
                    metadata: {
                        triage: { risk: triage.riskLevel, depth: triage.reviewDepth },
                        hasRepoMap: !!repoMap,
                        hasLearnings: !!learningsContext,
                        hasPathInstructions: pathInstructions.length > 0,
                    },
                })
            } catch { /* non-fatal */ }
        }

        // Add summary tokens to total
        result.inputTokens += summaryTokens.input
        result.outputTokens += summaryTokens.output

        // Mark incremental review
        if (isIncremental) {
            result.isIncremental = true
        }

        // Post results to GitHub
        await postReviewToGitHub(octokit, owner, repo, issueNumber, result, commentId)

        // Save to DB
        await db.update(reviewResults)
            .set({
                status: 'completed',
                summary: result.summary,
                verdict: result.verdict,
                inlineCommentsCount: result.inlineComments.length,
                securityIssuesCount: result.securityIssues.length,
                filesReviewed: result.filesReviewed,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                headSha: prContext.headSha,
                resultData: {
                    inlineComments: result.inlineComments,
                    securityIssues: result.securityIssues,
                    intentAnalysis: result.intentAnalysis,
                    aiPatternAnalysis: result.aiPatternAnalysis,
                    coachingSummary: result.coachingSummary,
                },
                completedAt: new Date(),
            })
            .where(eq(reviewResults.id, reviewId))

        // Fire-and-forget review completion notification
        void notifyReviewComplete({
            repo: repoFullName,
            prNumber: issueNumber,
            verdict: result.verdict || 'COMMENT',
            summary: result.summary || '',
            inlineComments: result.inlineComments.length,
            securityIssues: result.securityIssues.length,
            actionType,
            prUrl: `https://github.com/${repoFullName}/pull/${issueNumber}`,
        })

        return result

    } catch (error: any) {
        console.error(`Review engine error for ${repoFullName}#${issueNumber}:`, error.message)

        await db.update(reviewResults)
            .set({ status: 'failed', summary: error.message, completedAt: new Date() })
            .where(eq(reviewResults.id, reviewId))

        // Update event log
        await db.update(eventLogs)
            .set({ status: 'failed', message: error.message })
            .where(eq(eventLogs.repo, repoFullName))

        throw error
    }
}

