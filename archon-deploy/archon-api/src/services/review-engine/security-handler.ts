/**
 * Full Security Report handler — extracted from review-engine.ts
 */
import { Octokit } from "@octokit/rest"
import type { ReviewResult, PRContext } from "./types.js"
import { callAI, truncatePrompt } from "./ai-client.js"
import { FULL_SECURITY_REPORT_PROMPT } from "./prompts.js"
import { selectSecurityKeyFiles, saveSecurityReport, extractTopFindings } from "./file-selection.js"
import { loadProjectMemory } from "../project-memory.js"
import { runStaticScan, buildStaticFindingsContext } from "../static-scanner.js"

export async function runFullSecurityReport(
    octokit: Octokit, owner: string, repo: string, issueNumber: number,
    provider: string, apiKey: string, model: string,
    requestedBy?: string, prContext?: PRContext
): Promise<ReviewResult> {
    console.log(`Running full security report for ${owner}/${repo}...`)

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
            // Exclude noise
            .filter((t: { path: string }) =>
                !t.path.startsWith('node_modules/') &&
                !t.path.startsWith('.git/') &&
                !t.path.startsWith('dist/') &&
                !t.path.startsWith('build/') &&
                !t.path.startsWith('.') &&
                t.path.length > 0
            )
            .slice(0, 500)
    } catch (err: any) {
        console.warn(`Tree fetch failed: ${err.message}`)
    }

    // 2. Select security-relevant files (<=25)
    const keyFilePaths = selectSecurityKeyFiles(rawTree)
    console.log(`Selected ${keyFilePaths.length} security-relevant files`)

    // 3. Fetch file contents
    let fileContext = ''
    let filesFetched = 0
    for (const filePath of keyFilePaths) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path: filePath, ref: defaultBranch,
            })
            if ('content' in data && typeof data.content === 'string') {
                const raw = Buffer.from(data.content, 'base64').toString('utf-8')
                const trimmed = raw.split('\n').slice(0, 300).join('\n')
                fileContext += `\n<file path="${filePath}">\n${trimmed}\n</file>\n`
                filesFetched++
            }
        } catch { /* binary or inaccessible */ }
    }

    // 4. Layer 1: Run static pattern scan on fetched files
    const fetchedFileObjects = keyFilePaths.map(filePath => {
        const tag = `<file path="${filePath}">`
        const start = fileContext.indexOf(tag)
        if (start === -1) return { filename: filePath, contents: '' }
        const end = fileContext.indexOf('</file>', start)
        const contents = end !== -1
            ? fileContext.substring(start + tag.length, end).trim()
            : ''
        return { filename: filePath, contents }
    })
    const staticFindings = runStaticScan(fetchedFileObjects)
    const staticFindingsContext = buildStaticFindingsContext(staticFindings)
    if (staticFindings.length > 0) {
        console.log(`Static scan (full report): ${staticFindings.length} pattern matches in ${owner}/${repo}`)
    }

    // 5. Load project memory for injected context
    let memoryContext = ''
    try {
        const memory = await loadProjectMemory(octokit, owner, repo)
        if (memory) memoryContext = `\n## Project Memory\n${memory}\n`
    } catch { /* non-fatal */ }

    // 6. Build user prompt
    const today = new Date().toISOString().split('T')[0]
    let userPrompt = `## Repository: ${owner}/${repo}\n`
    userPrompt += `**Report Date:** ${today}\n`
    userPrompt += `**Triggered by:** ${requestedBy || 'team'}\n\n`

    userPrompt += `### File Tree (${rawTree.length} total files, showing security-relevant subset)\n\`\`\`\n`
    userPrompt += rawTree.map(t => t.path).join('\n').substring(0, 5000)
    userPrompt += '\n```\n'

    if (staticFindingsContext) userPrompt += staticFindingsContext
    if (memoryContext) userPrompt += memoryContext

    userPrompt += `\n### File Contents (${filesFetched} key files)\n${fileContext}`

    if (prContext) {
        userPrompt += `\n### PR #${prContext.number} Diff Context\n`
        userPrompt += `**Title:** ${prContext.title}\n`
        userPrompt += `**Branch:** ${prContext.headBranch} → ${prContext.baseBranch}\n\n`
        for (const f of prContext.filesChanged.slice(0, 20)) {
            if (f.patch) {
                userPrompt += `\`\`\`diff\n${f.patch.substring(0, 3000)}\n\`\`\`\n`
            }
        }
    }

    // Replace placeholder tokens in prompt
    const promptWithMeta = FULL_SECURITY_REPORT_PROMPT
        .replace('[REPO_NAME]', `${owner}/${repo}`)
        .replace('[TODAY]', today)
        .replace('[TRIGGERED_BY]', `@${requestedBy || 'team'}`)

    if (userPrompt.length > 120000) {
        userPrompt = truncatePrompt(userPrompt, 120000, 'security-report')
    }

    console.log(`Sending ${userPrompt.length} chars to ${provider}/${model} for security report...`)
    const { text, inputTokens, outputTokens } = await callAI(
        promptWithMeta, userPrompt, provider, apiKey, model, 8192
    )

    // 6. Build full report with header
    const fullReport = text

    // 7. Save report to repo
    const reportDate = today
    const reportPath = `.archon/reports/security-${reportDate}.md`
    let savedToRepo = false
    let reportUrl = ''
    try {
        await saveSecurityReport(octokit, owner, repo, reportPath, fullReport)
        savedToRepo = true
        reportUrl = `https://github.com/${owner}/${repo}/blob/${defaultBranch}/${reportPath}`
        console.log(`Security report saved to ${reportPath}`)
    } catch (err: any) {
        console.warn(`Could not save security report to repo (non-fatal): ${err.message}`)
    }

    // 8. Extract top findings
    const topFindings = extractTopFindings(text)

    // 9. Build summary comment
    let summaryComment = `## Archon Security Report\n\n`

    if (savedToRepo) {
        summaryComment += `📄 Full report committed to [\`${reportPath}\`](${reportUrl})\n\n`
    }

    if (topFindings.length > 0) {
        summaryComment += `### Top Findings\n\n`
        for (const f of topFindings) {
            summaryComment += `- ${f}\n`
        }
        summaryComment += '\n'
    } else {
        summaryComment += `> No CRITICAL or HIGH severity issues were identified.\n\n`
    }

    summaryComment += `<details><summary>Preview first 3000 chars of report</summary>\n\n`
    summaryComment += `\`\`\`\n${text.substring(0, 3000)}\n\`\`\`\n\n`
    summaryComment += `</details>\n`

    if (!savedToRepo) {
        // Post full report inline since we couldn't commit it
        summaryComment += `\n<details><summary>Full Report</summary>\n\n${text}\n\n</details>\n`
    }

    // 10. Post comment (only when triggered from a GitHub issue/PR — not frontend dashboard)
    if (issueNumber > 0) {
        try {
            await octokit.rest.issues.createComment({
                owner, repo, issue_number: issueNumber,
                body: summaryComment,
            })
        } catch (err: any) {
            console.warn(`Could not post security report comment to #${issueNumber}: ${err.message}`)
        }
    }

    return {
        summary: summaryComment,
        fullReport: fullReport,
        verdict: 'COMMENT',
        inlineComments: [],
        securityIssues: [],
        filesReviewed: filesFetched,
        inputTokens,
        outputTokens,
    }
}
