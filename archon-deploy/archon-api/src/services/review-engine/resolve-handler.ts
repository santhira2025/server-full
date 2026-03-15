/**
 * Resolve handler — extracted from review-engine.ts
 * Handles PR resolution, issue resolution, and feedback fix flows.
 */
import { Octokit } from "@octokit/rest"
import type { PRContext, ReviewResult } from "./types.js"
import { callAI, truncatePrompt } from "./ai-client.js"
import { parseJSON } from "./json-utils.js"
import { RESOLVE_PROMPT, RESOLVE_FROM_ISSUE_PROMPT } from "./prompts.js"
import { createBranch, commitFile, deleteFile, fetchFileContentsForResolve } from "./github-ops.js"
import { validateGeneratedCode } from "../review-pipeline.js"

// ── Resolve Engine: Fix code from PR ─────────────────────────────────

export async function runPRResolution(
    octokit: Octokit, owner: string, repo: string,
    ctx: PRContext, provider: string, apiKey: string, model: string,
    requestedBy?: string
): Promise<ReviewResult> {
    // Build prompt with full file contents for fixing
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n`
    prompt += `**Description:** ${ctx.body || '(none)'}\n\n`
    prompt += `### Files with Issues\n\n`

    for (const f of ctx.filesChanged) {
        prompt += `#### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`
        if (f.patch) prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n`
        if (f.contents) {
            prompt += `<full_file path="${f.filename}">\n${f.contents}\n</full_file>\n\n`
        }
    }

    prompt += `\n### Instructions\nFix ALL security vulnerabilities, bugs, and code quality issues in the files above. Generate the complete corrected file contents.`

    if (prompt.length > 150000) {
        prompt = truncatePrompt(prompt, 150000, 'pr-resolution')
    }

    // If no file contents were fetched (e.g., merged PR), try fetching from default branch
    for (const f of ctx.filesChanged) {
        if (!f.contents && f.status !== 'removed') {
            try {
                const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
                const { data } = await octokit.rest.repos.getContent({
                    owner, repo, path: f.filename, ref: repoData.default_branch,
                })
                if ('content' in data && typeof data.content === 'string') {
                    f.contents = Buffer.from(data.content, 'base64').toString('utf-8')
                    prompt += `<full_file path="${f.filename}">\n${f.contents}\n</full_file>\n\n`
                }
            } catch { /* file not found */ }
        }
    }

    console.log(`Sending ${prompt.length} chars to ${provider}/${model} for PR resolution...`)
    const { text, inputTokens, outputTokens } = await callAI(RESOLVE_PROMPT, prompt, provider, apiKey, model, 8192)

    console.log(`AI resolve response length: ${text.length} chars`)
    console.log(`AI resolve response (first 1000 chars): ${text.substring(0, 1000)}`)
    console.log(`AI resolve response (last 200 chars): ${text.substring(text.length - 200)}`)
    const parsed = parseJSON(text)
    console.log(`Parsed resolve result: files=${parsed.files?.length || 0}, summary=${(parsed.summary || '').substring(0, 100)}`)

    if (!parsed.files || parsed.files.length === 0) {
        return {
            summary: parsed.summary || 'No fixes could be generated.',
            verdict: 'COMMENT',
            inlineComments: [], securityIssues: [],
            filesReviewed: ctx.filesChanged.length,
            inputTokens, outputTokens,
            filesModified: [],
        }
    }

    // ── Validation Loop — Feature 4.2 ──
    try {
        console.log('Validating generated code...')
        const validation = await validateGeneratedCode(parsed.files, provider, apiKey, model)
        if (!validation.valid) {
            console.warn(`Validation found issues: ${validation.issues.join(', ')}`)
        }
        // Use the potentially corrected files
        parsed.files = validation.files
    } catch (err: any) {
        console.warn(`Validation loop failed (non-fatal): ${err.message}`)
    }

    // Get default branch for base
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch

    // Create fix branch
    const branchName = `archon/fix-pr-${ctx.number}-${Date.now()}`
    await createBranch(octokit, owner, repo, branchName, defaultBranch)

    // Commit each file
    const filesModified: string[] = []
    for (const file of parsed.files) {
        if (!file.path || !file.content) continue
        try {
            const coAuthor = requestedBy ? { name: requestedBy, email: `${requestedBy}@users.noreply.github.com` } : undefined
            await commitFile(octokit, owner, repo, branchName, file.path, file.content, file.action === 'create', undefined, coAuthor)
            filesModified.push(file.path)
            console.log(`  Committed fix: ${file.path} (${file.action})`)
        } catch (err: any) {
            console.warn(`  Failed to commit ${file.path}: ${err.message}`)
        }
    }

    if (filesModified.length === 0) {
        return {
            summary: 'Fix generation succeeded but no files could be committed.',
            verdict: 'COMMENT',
            inlineComments: [], securityIssues: [],
            filesReviewed: ctx.filesChanged.length,
            inputTokens, outputTokens,
            branchName, filesModified: [],
        }
    }

    // Create fix PR
    const prBody = `## Automated Fix by Archon\n\n${parsed.summary || 'Fixes applied.'}\n\n**Files modified:**\n${filesModified.map(f => '- `' + f + '`').join('\n')}\n\n---\n*Generated from PR #${ctx.number}*`

    const { data: newPR } = await octokit.rest.pulls.create({
        owner, repo,
        title: parsed.commit_message || `fix: resolve issues from PR #${ctx.number}`,
        body: prBody,
        head: branchName,
        base: defaultBranch,
    })

    console.log(`Created fix PR #${newPR.number} from branch ${branchName}`)

    // Comment on original PR
    await octokit.rest.issues.createComment({
        owner, repo, issue_number: ctx.number,
        body: `Archon has generated a fix in PR #${newPR.number}.\n\n${parsed.summary || ''}`,
    })

    return {
        summary: parsed.summary || `Fix PR #${newPR.number} created with ${filesModified.length} file(s) modified.`,
        verdict: 'COMMENT',
        inlineComments: [], securityIssues: [],
        filesReviewed: ctx.filesChanged.length,
        inputTokens, outputTokens,
        branchName,
        prNumber: newPR.number,
        filesModified,
    }
}

// ── Resolve Engine: Fix code from Issue ──────────────────────────────

export async function runIssueResolution(
    octokit: Octokit, owner: string, repo: string, issueNumber: number,
    provider: string, apiKey: string, model: string, requestedBy?: string
): Promise<ReviewResult> {
    // Fetch issue details
    const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })

    // Fetch repo tree for context
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    const defaultBranch = repoData.default_branch

    let repoTree: string[] = []
    try {
        const { data: tree } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: defaultBranch, recursive: 'true',
        })
        repoTree = tree.tree
            .filter((t: any) => t.type === 'blob')
            .map((t: any) => t.path)
            .slice(0, 1000)
    } catch (err: any) {
        console.warn(`Failed to fetch repo tree: ${err.message}`)
    }

    // Fetch issue comments for extra context
    const { data: comments } = await octokit.rest.issues.listComments({
        owner, repo, issue_number: issueNumber, per_page: 10,
    })
    const commentContext = comments
        .filter((c: any) => !c.user?.login?.includes('[bot]'))
        .map((c: any) => `@${c.user?.login}: ${c.body}`)
        .join('\n\n')

    // First call: ask AI which files it needs to read
    const planPrompt = `## Issue #${issueNumber}: ${issue.title}

**Body:**
${issue.body || '(no description)'}

**Labels:** ${issue.labels.map((l: any) => typeof l === 'string' ? l : l.name).join(', ') || 'none'}

${commentContext ? `**Comments:**\n${commentContext}\n` : ''}

### Repository File Tree
\`\`\`
${repoTree.join('\n')}
\`\`\`

Analyze this issue and determine what files need to be modified or created. If you need to read existing file contents first, list them in "files_to_read". Otherwise, generate the fixes directly.`

    console.log(`Sending issue #${issueNumber} to ${provider}/${model} for resolution planning...`)
    let { text, inputTokens, outputTokens } = await callAI(RESOLVE_FROM_ISSUE_PROMPT, planPrompt, provider, apiKey, model, 8192)
    let parsed = parseJSON(text)
    let totalInput = inputTokens
    let totalOutput = outputTokens

    // If AI needs to read files first, fetch them and call again
    if (parsed.files_to_read && parsed.files_to_read.length > 0 && (!parsed.files || parsed.files.length === 0)) {
        console.log(`AI requested ${parsed.files_to_read.length} files to read...`)

        const fileContents = await fetchFileContentsForResolve(octokit, owner, repo, parsed.files_to_read, defaultBranch)

        let resolvePrompt = planPrompt + '\n\n### Requested File Contents\n\n'
        for (const [path, content] of fileContents) {
            resolvePrompt += `<file path="${path}">\n${content}\n</file>\n\n`
        }
        resolvePrompt += '\nNow generate the fixed file contents based on the issue and the file contents above.'

        if (resolvePrompt.length > 150000) {
            resolvePrompt = truncatePrompt(resolvePrompt, 150000, 'issue-resolution')
        }

        const result2 = await callAI(RESOLVE_FROM_ISSUE_PROMPT, resolvePrompt, provider, apiKey, model, 8192)
        text = result2.text
        parsed = parseJSON(text)
        totalInput += result2.inputTokens
        totalOutput += result2.outputTokens
    }

    if (!parsed.files || parsed.files.length === 0) {
        // No code changes — post analysis comment
        const summary = parsed.summary || 'Archon analyzed this issue but could not generate automated fixes. Manual intervention is needed.'
        await octokit.rest.issues.createComment({
            owner, repo, issue_number: issueNumber,
            body: `## Archon Analysis\n\n${summary}`,
        })
        return {
            summary, verdict: 'COMMENT',
            inlineComments: [], securityIssues: [],
            filesReviewed: 0, inputTokens: totalInput, outputTokens: totalOutput,
            filesModified: [],
        }
    }

    // Create fix branch — check if an existing open PR already targets this branch
    const baseBranchName = `archon/fix-issue-${issueNumber}`
    const { data: existingPRs } = await octokit.rest.pulls.list({
        owner, repo, state: 'open', head: `${owner}:${baseBranchName}`, per_page: 1,
    })
    const branchName = existingPRs.length > 0
        ? `archon/fix-issue-${issueNumber}-${Date.now()}` // prior open PR exists — create new branch
        : baseBranchName
    await createBranch(octokit, owner, repo, branchName, defaultBranch)

    // Commit each file
    const coAuthor = requestedBy ? { name: requestedBy, email: `${requestedBy}@users.noreply.github.com` } : undefined
    const filesModified: string[] = []
    for (const file of parsed.files) {
        if (!file.path) continue
        if (file.action === 'delete') {
            try {
                await deleteFile(octokit, owner, repo, branchName, file.path, coAuthor)
                filesModified.push(file.path)
                console.log(`  Deleted: ${file.path}`)
            } catch (err: any) {
                console.warn(`  Failed to delete ${file.path}: ${err.message}`)
            }
        } else if (file.content) {
            try {
                await commitFile(octokit, owner, repo, branchName, file.path, file.content, file.action === 'create', undefined, coAuthor)
                filesModified.push(file.path)
                console.log(`  Committed: ${file.path} (${file.action})`)
            } catch (err: any) {
                console.warn(`  Failed to commit ${file.path}: ${err.message}`)
            }
        }
    }

    if (filesModified.length === 0) {
        await octokit.rest.issues.createComment({
            owner, repo, issue_number: issueNumber,
            body: `## Archon Analysis\n\n${parsed.summary || 'Analysis complete.'}\n\nFix generation succeeded but no files could be committed.`,
        })
        return {
            summary: parsed.summary || 'No files committed.',
            verdict: 'COMMENT',
            inlineComments: [], securityIssues: [],
            filesReviewed: 0, inputTokens: totalInput, outputTokens: totalOutput,
            branchName, filesModified: [],
        }
    }

    // Create fix PR
    const commitMsg = parsed.commit_message || `fix: resolve issue #${issueNumber}`
    const prBody = `## Automated Fix by Archon\n\n${parsed.summary || ''}\n\nCloses #${issueNumber}\n\n**Files modified:**\n${filesModified.map(f => '- \`' + f + '\`').join('\n')}\n\n**Per-file explanations:**\n${(parsed.files || []).filter((f: any) => f.explanation).map((f: any) => '- **' + f.path + '**: ' + f.explanation).join('\n')}`

    const { data: newPR } = await octokit.rest.pulls.create({
        owner, repo,
        title: commitMsg,
        body: prBody,
        head: branchName,
        base: defaultBranch,
    })

    console.log(`Created fix PR #${newPR.number} for issue #${issueNumber}`)

    // Comment on the issue
    await octokit.rest.issues.createComment({
        owner, repo, issue_number: issueNumber,
        body: `Archon has created a fix in PR #${newPR.number}.\n\n${parsed.summary || ''}`,
    })

    return {
        summary: parsed.summary || `Fix PR #${newPR.number} created.`,
        verdict: 'COMMENT',
        inlineComments: [], securityIssues: [],
        filesReviewed: filesModified.length,
        inputTokens: totalInput, outputTokens: totalOutput,
        branchName,
        prNumber: newPR.number,
        filesModified,
    }
}

// ── PR Feedback Fix ──────────────────────────────────────────────────

export async function runFeedbackFix(
    octokit: Octokit, owner: string, repo: string,
    prNumber: number, fixAll: boolean,
    provider: string, apiKey: string, model: string,
    requestedBy?: string
): Promise<ReviewResult> {
    // 1. Fetch PR details
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    const headBranch = pr.head.ref

    // 2. Fetch review comments
    const allComments: any[] = []
    let page = 1
    while (true) {
        const { data: comments } = await octokit.rest.pulls.listReviewComments({
            owner, repo, pull_number: prNumber, per_page: 100, page,
        })
        allComments.push(...comments)
        if (comments.length < 100) break
        page++
    }

    // Filter out bot comments
    const humanComments = allComments.filter(c => c.user?.type !== "Bot")

    if (humanComments.length === 0) {
        return {
            summary: "No review comments found to fix.",
            verdict: "COMMENT",
            inlineComments: [], securityIssues: [],
            filesReviewed: 0, inputTokens: 0, outputTokens: 0,
            filesModified: [],
        }
    }

    // 3. Select comments to fix
    let commentsToFix: any[]
    if (fixAll) {
        commentsToFix = humanComments
    } else {
        // For `/archon fix`: most recent unresolved comments
        commentsToFix = humanComments
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            .slice(0, 5)
    }

    // 4. Gather file contents for referenced files
    const affectedFiles = [...new Set(commentsToFix.map((c: any) => c.path))]
    const fileContents = new Map<string, string>()
    for (const filePath of affectedFiles.slice(0, 20)) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path: filePath, ref: pr.head.sha,
            })
            if ("content" in data && typeof data.content === "string") {
                fileContents.set(filePath, Buffer.from(data.content, "base64").toString("utf-8"))
            }
        } catch { /* file not accessible */ }
    }

    // 5. Build prompt
    let prompt = `## PR #${prNumber}: ${pr.title}\n\n`
    prompt += `### Review Comments to Fix\n\n`
    for (const comment of commentsToFix) {
        prompt += `**File:** \`${comment.path}\` **Line:** ${comment.original_line || comment.line}\n`
        prompt += `**Reviewer @${comment.user?.login}:** ${comment.body}\n`
        if (comment.diff_hunk) {
            prompt += `\`\`\`diff\n${comment.diff_hunk}\n\`\`\`\n`
        }
        prompt += "\n"
    }

    prompt += `### Current File Contents\n\n`
    for (const [path, content] of fileContents) {
        prompt += `<file path="${path}">\n${content}\n</file>\n\n`
    }

    prompt += `\nFix the issues described in the review comments above. Generate the corrected file contents.`

    if (prompt.length > 150000) {
        prompt = truncatePrompt(prompt, 150000, 'feedback-fix')
    }

    // 6. Call AI
    console.log(`Sending ${prompt.length} chars to ${provider}/${model} for feedback fix...`)
    const { text, inputTokens, outputTokens } = await callAI(RESOLVE_PROMPT, prompt, provider, apiKey, model, 8192)

    const parsed = parseJSON(text)

    if (!parsed.files || parsed.files.length === 0) {
        return {
            summary: parsed.summary || "Could not generate fixes for the feedback.",
            verdict: "COMMENT",
            inlineComments: [], securityIssues: [],
            filesReviewed: affectedFiles.length,
            inputTokens, outputTokens,
            filesModified: [],
        }
    }

    // 7. Commit directly to the PR's head branch
    const coAuthor = requestedBy ? { name: requestedBy, email: `${requestedBy}@users.noreply.github.com` } : undefined
    const filesModified: string[] = []
    for (const file of parsed.files) {
        if (!file.path || !file.content) continue
        try {
            await commitFile(octokit, owner, repo, headBranch, file.path, file.content,
                file.action === "create",
                `fix: address review feedback in ${file.path}`,
                coAuthor)
            filesModified.push(file.path)
        } catch (err: any) {
            console.warn(`Failed to commit fix for ${file.path}: ${err.message}`)
        }
    }

    const summaryMsg = fixAll
        ? `Fixed ${filesModified.length} file(s) based on ${commentsToFix.length} review comments.`
        : `Fixed ${filesModified.length} file(s) based on recent review feedback.`

    return {
        summary: `${summaryMsg}\n\n${parsed.summary || ""}\n\n**Files updated:**\n${filesModified.map(f => "- `" + f + "`").join("\n")}`,
        verdict: "COMMENT",
        inlineComments: [], securityIssues: [],
        filesReviewed: affectedFiles.length,
        inputTokens, outputTokens,
        filesModified,
    }
}
