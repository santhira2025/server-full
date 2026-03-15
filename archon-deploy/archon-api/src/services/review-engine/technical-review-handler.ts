/**
 * Full Technical Review and Comprehensive Security Audit handlers
 * — extracted from review-engine.ts
 */
import { Octokit } from "@octokit/rest"
import type { ReviewResult } from "./types.js"
import { callAI, truncatePrompt } from "./ai-client.js"
import { FULL_TECHNICAL_REVIEW_PROMPT, COMPREHENSIVE_SECURITY_AUDIT_PROMPT } from "./prompts.js"
import { selectSecurityKeyFiles, selectBroadKeyFiles, saveSecurityReport, extractTopFindings } from "./file-selection.js"
import { fetchFilesParallel } from "../parallel-fetch.js"
import { loadProjectMemory } from "../project-memory.js"
import { runStaticScan, buildStaticFindingsContext } from "../static-scanner.js"

export type ProgressFn = (stage: string, current: number, total: number, currentFile?: string) => Promise<void>

export async function runFullTechnicalReview(
    octokit: Octokit, owner: string, repo: string,
    provider: string, apiKey: string, model: string,
    requestedBy?: string, onProgress?: ProgressFn
): Promise<ReviewResult> {
    console.log(`Running full technical review for ${owner}/${repo}...`)

    const progress = onProgress || (async () => {})

    await progress('Fetching repository structure', 0, 100)

    // 1. Fetch repo metadata + file tree
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch

    let rawTree: Array<{ path: string }> = []
    try {
        const { data: treeData } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: defaultBranch, recursive: 'true',
        })
        rawTree = (treeData.tree || [])
            .filter((t: any) => t.type === 'blob')
            .map((t: any) => ({ path: t.path || '' }))
            .filter((t: { path: string }) =>
                !t.path.startsWith('node_modules/') &&
                !t.path.startsWith('.git/') &&
                !t.path.startsWith('dist/') &&
                !t.path.startsWith('build/') &&
                t.path.length > 0
            )
            .slice(0, 500)
    } catch (err: any) {
        console.warn(`Technical review: repo tree fetch failed: ${err.message}`)
    }

    // 2. Select broad set of files across all categories
    const keyFilePaths = selectBroadKeyFiles(rawTree)
    console.log(`Technical review: selected ${keyFilePaths.length} files from ${rawTree.length} total`)

    await progress('Scanning files', 0, keyFilePaths.length)

    // 3. Fetch file contents in parallel batches with progress updates
    let fileContext = ''
    let filesFetched = 0
    const techFetchResults = await fetchFilesParallel(octokit, owner, repo, defaultBranch, keyFilePaths, {
        lineCap: 200,
        onProgress: (fetched, total, file) => progress('Scanning files', fetched, total, file),
    })
    for (const result of techFetchResults) {
        if (result.contents) {
            fileContext += `\n<file path="${result.path}">\n${result.contents}\n</file>\n`
            filesFetched++
        }
    }

    await progress('Analyzing codebase with AI', keyFilePaths.length, keyFilePaths.length)

    // 4. Load project memory for additional context
    let memoryContext = ''
    try {
        const memory = await loadProjectMemory(octokit, owner, repo)
        if (memory) memoryContext = `\n## Project Memory (from .archon/memory.md)\n${memory}\n`
    } catch { /* non-fatal */ }

    // 5. Build prompt
    const today = new Date().toISOString().split('T')[0]
    let userPrompt = `## Repository: ${owner}/${repo}\n`
    userPrompt += `**Description:** ${repoData.description || 'No description provided'}\n`
    userPrompt += `**Language:** ${repoData.language || 'Unknown'}\n`
    userPrompt += `**Report Date:** ${today}\n`
    userPrompt += `**Triggered by:** ${requestedBy || 'team'}\n\n`

    userPrompt += `### File Tree (${rawTree.length} total files)\n\`\`\`\n`
    userPrompt += rawTree.map(t => t.path).join('\n').substring(0, 6000)
    userPrompt += '\n```\n'

    if (memoryContext) userPrompt += memoryContext

    userPrompt += `\n### Source Files (${filesFetched} files analyzed)\n${fileContext}`

    if (userPrompt.length > 140000) {
        userPrompt = truncatePrompt(userPrompt, 140000, 'technical-review')
    }

    const promptWithMeta = FULL_TECHNICAL_REVIEW_PROMPT
        .replace('[REPO_NAME]', `${owner}/${repo}`)
        .replace('[TODAY]', today)
        .replace('[TRIGGERED_BY]', `@${requestedBy || 'team'}`)

    console.log(`Technical review: sending ${userPrompt.length} chars to ${provider}/${model}...`)
    const { text, inputTokens, outputTokens } = await callAI(
        promptWithMeta, userPrompt, provider, apiKey, model, 8192
    )

    // 6. Save report to repo
    const reportPath = `.archon/reports/technical-review-${today}.md`
    let savedToRepo = false
    let reportUrl = ''
    try {
        await saveSecurityReport(octokit, owner, repo, reportPath, text)
        savedToRepo = true
        reportUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${reportPath}`
        console.log(`Technical review saved to ${reportPath}`)
    } catch (err: any) {
        console.warn(`Could not save technical review to repo (non-fatal): ${err.message}`)
    }

    // 7. Build summary
    const summaryComment = [
        `## Archon Technical Review`,
        ``,
        savedToRepo
            ? `📄 Full report committed to [\`${reportPath}\`](${reportUrl})`
            : `> Report could not be saved to repository.`,
        ``,
        `**Files analyzed:** ${filesFetched} | **Repository:** ${owner}/${repo}`,
        ``,
        `<details><summary>Preview (first 2000 chars)</summary>`,
        ``,
        `\`\`\``,
        text.substring(0, 2000),
        `\`\`\``,
        ``,
        `</details>`,
    ].join('\n')

    return {
        summary: summaryComment,
        fullReport: text,
        verdict: 'COMMENT',
        inlineComments: [],
        securityIssues: [],
        filesReviewed: filesFetched,
        inputTokens,
        outputTokens,
    }
}

export async function runComprehensiveSecurityAudit(
    octokit: Octokit, owner: string, repo: string,
    provider: string, apiKey: string, model: string,
    requestedBy?: string, onProgress?: ProgressFn
): Promise<ReviewResult> {
    console.log(`Running comprehensive security audit for ${owner}/${repo}...`)

    const progress = onProgress || (async () => {})

    await progress('Fetching repository structure', 0, 100)

    // 1. Fetch repo metadata + file tree
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch

    let rawTree: Array<{ path: string }> = []
    try {
        const { data: treeData } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: defaultBranch, recursive: 'true',
        })
        rawTree = (treeData.tree || [])
            .filter((t: any) => t.type === 'blob')
            .map((t: any) => ({ path: t.path || '' }))
            .filter((t: { path: string }) =>
                !t.path.startsWith('node_modules/') &&
                !t.path.startsWith('.git/') &&
                !t.path.startsWith('dist/') &&
                !t.path.startsWith('build/') &&
                t.path.length > 0
            )
            .slice(0, 500)
    } catch (err: any) {
        console.warn(`Security audit: repo tree fetch failed: ${err.message}`)
    }

    // 2. Select security-relevant files — up to 50 (vs 25 for quick scan)
    // First pass: security-scored files
    const securityScored = selectSecurityKeyFiles(rawTree)
    // Second pass: add any route/middleware/handler files not already captured
    const extraFiles = rawTree
        .map(t => t.path)
        .filter(p => /routes\/|controllers\/|middleware\/|handlers\//i.test(p))
        .filter(p => !securityScored.includes(p))
        .slice(0, 25)
    const keyFilePaths = [...securityScored, ...extraFiles].slice(0, 50)

    console.log(`Security audit: selected ${keyFilePaths.length} files`)

    await progress('Running static pattern scan', 0, keyFilePaths.length)

    // 3. Fetch file contents in parallel batches
    const fetchedFileObjects: Array<{ filename: string; contents: string }> = []
    let fileContext = ''
    let filesFetched = 0

    const auditFetchResults = await fetchFilesParallel(octokit, owner, repo, defaultBranch, keyFilePaths, {
        lineCap: 300,
        onProgress: (fetched, total, file) => progress('Fetching and scanning files', fetched, total, file),
    })
    for (const result of auditFetchResults) {
        if (result.contents) {
            fileContext += `\n<file path="${result.path}">\n${result.contents}\n</file>\n`
            fetchedFileObjects.push({ filename: result.path, contents: result.contents })
            filesFetched++
        }
    }

    // 4. Layer 1: Run static pattern scan
    const staticFindings = runStaticScan(fetchedFileObjects)
    const staticFindingsContext = buildStaticFindingsContext(staticFindings)
    if (staticFindings.length > 0) {
        console.log(`Security audit static scan: ${staticFindings.length} pattern matches`)
    }

    await progress('Running AI security analysis', keyFilePaths.length, keyFilePaths.length)

    // 5. Load project memory
    let memoryContext = ''
    try {
        const memory = await loadProjectMemory(octokit, owner, repo)
        if (memory) memoryContext = `\n## Project Memory\n${memory}\n`
    } catch { /* non-fatal */ }

    // 6. Build prompt
    const today = new Date().toISOString().split('T')[0]
    let userPrompt = `## Repository: ${owner}/${repo}\n`
    userPrompt += `**Audit Date:** ${today}\n`
    userPrompt += `**Requested by:** ${requestedBy || 'team'}\n\n`

    userPrompt += `### File Tree (${rawTree.length} total files)\n\`\`\`\n`
    userPrompt += rawTree.map(t => t.path).join('\n').substring(0, 5000)
    userPrompt += '\n```\n'

    if (staticFindingsContext) userPrompt += staticFindingsContext
    if (memoryContext) userPrompt += memoryContext

    userPrompt += `\n### Source Files (${filesFetched} files — full contents)\n${fileContext}`

    if (userPrompt.length > 140000) {
        userPrompt = truncatePrompt(userPrompt, 140000, 'security-audit')
    }

    const promptWithMeta = COMPREHENSIVE_SECURITY_AUDIT_PROMPT
        .replace('[REPO_NAME]', `${owner}/${repo}`)
        .replace('[TODAY]', today)
        .replace('[TRIGGERED_BY]', `@${requestedBy || 'team'}`)

    console.log(`Security audit: sending ${userPrompt.length} chars to ${provider}/${model}...`)
    const { text, inputTokens, outputTokens } = await callAI(
        promptWithMeta, userPrompt, provider, apiKey, model, 8192
    )

    // 7. Save report to repo
    const reportPath = `.archon/reports/security-audit-${today}.md`
    let savedToRepo = false
    let reportUrl = ''
    try {
        await saveSecurityReport(octokit, owner, repo, reportPath, text)
        savedToRepo = true
        reportUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${reportPath}`
        console.log(`Security audit saved to ${reportPath}`)
    } catch (err: any) {
        console.warn(`Could not save security audit to repo (non-fatal): ${err.message}`)
    }

    // 8. Extract top findings
    const topFindings = extractTopFindings(text)

    // 9. Build summary comment
    const summaryComment = [
        `## Archon Comprehensive Security Audit`,
        ``,
        savedToRepo
            ? `📄 Full audit committed to [\`${reportPath}\`](${reportUrl})`
            : `> Report could not be saved to repository.`,
        ``,
        topFindings.length > 0
            ? `### Top Findings\n\n` + topFindings.map(f => `- ${f}`).join('\n')
            : `> No CRITICAL or HIGH severity issues identified.`,
        ``,
        `**Files analyzed:** ${filesFetched} | **Static matches:** ${staticFindings.length}`,
        ``,
        `<details><summary>Preview (first 2000 chars)</summary>`,
        ``,
        `\`\`\``,
        text.substring(0, 2000),
        `\`\`\``,
        ``,
        `</details>`,
    ].join('\n')

    return {
        summary: summaryComment,
        fullReport: text,
        verdict: 'COMMENT',
        inlineComments: [],
        securityIssues: [],
        filesReviewed: filesFetched,
        inputTokens,
        outputTokens,
    }
}
