/**
 * GitHub API operations: posting reviews, creating branches, committing files.
 */
import { Octokit } from "@octokit/rest"
import { fetchFilesParallel } from "../parallel-fetch.js"
import type { ReviewResult } from "./types.js"

// ── Post Results to GitHub ────────────────────────────────────────────

export async function postReviewToGitHub(
    octokit: Octokit, owner: string, repo: string,
    prNumber: number, result: ReviewResult, commentId?: number
): Promise<void> {
    // Build review body
    const reviewTitle = result.isIncremental ? 'Archon Incremental Review' : 'Archon Code Review'
    let body = `## ${reviewTitle}\n\n`
    if (result.isIncremental) {
        body += `> Reviewing only changes since last review.\n\n`
    }
    body += `${result.summary}\n\n`
    body += `**Files reviewed:** ${result.filesReviewed} | `
    body += `**Issues found:** ${result.inlineComments.length} | `
    body += `**Security issues:** ${result.securityIssues.length}\n\n`

    // Intent Validation section
    if (result.intentAnalysis) {
        const ia = result.intentAnalysis
        const icon = ia.matches ? '✅' : ia.score >= 70 ? '⚠️' : '❌'
        body += `### ${icon} Intent Validation (Score: ${ia.score}/100)\n\n`
        if (ia.linkedIssue) {
            body += `Linked to issue #${ia.linkedIssue.number}: ${ia.linkedIssue.title}\n\n`
        }
        if (ia.mismatches.length > 0) {
            body += `| Requirement | Status | Details |\n|---|---|---|\n`
            for (const m of ia.mismatches) {
                const statusIcon = m.status === 'missing' ? '🔴' : m.status === 'partial' ? '🟡' : '🟠'
                body += `| ${m.requirement} | ${statusIcon} ${m.status} | ${m.explanation} |\n`
            }
            body += '\n'
        }
    }

    // AI Code Audit section
    if (result.aiPatternAnalysis?.detected) {
        const ap = result.aiPatternAnalysis
        body += `### ⚠️ AI Code Patterns (Confidence: ${ap.confidence}%)\n\n`
        for (const p of ap.patterns) {
            const sevIcon = p.severity === 'high' ? '🔴' : p.severity === 'medium' ? '🟡' : '🔵'
            body += `- ${sevIcon} **${p.pattern}** in \`${p.file}:${p.line}\`: ${p.description}\n`
        }
        body += '\n'
    }

    // Security issues section — Layer 4: rich format with risk score
    if (result.securityIssues.length > 0) {
        const sevEmoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }
        const riskEmoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢', NONE: '✅' }

        const rl = result.riskLevel || 'MEDIUM'
        body += `### 🔒 Security Analysis\n\n`
        body += `**Overall Risk:** ${riskEmoji[rl] || ''} ${rl}`
        if (result.riskScore !== undefined) body += ` | **Risk Score:** ${result.riskScore}/100`
        body += `\n\n`

        for (const s of result.securityIssues) {
            const sev = s.severity.toUpperCase()
            body += `#### ${sevEmoji[sev] || ''} ${sev} — ${s.title || s.description.substring(0, 60)}\n`
            body += `**File:** \`${s.file}:${s.line}\``
            if (s.cwe) body += ` | **${s.cwe}**`
            if (s.owasp) body += ` | **${s.owasp}**`
            body += `\n\n`
            body += `${s.description}\n\n`
            if (s.attack_scenario) body += `**Attack scenario:** ${s.attack_scenario}\n\n`
            if (s.vulnerable_code) {
                body += `**Vulnerable:**\n\`\`\`\n${s.vulnerable_code}\n\`\`\`\n`
            }
            if (s.fixed_code) {
                body += `**Fixed:**\n\`\`\`\n${s.fixed_code}\n\`\`\`\n`
            }
            body += `**Fix:** ${s.recommendation}\n\n---\n\n`
        }

        if (result.passedChecks && result.passedChecks.length > 0) {
            body += `#### ✅ Passed Checks\n`
            for (const check of result.passedChecks) {
                body += `- ${check}\n`
            }
            body += '\n'
        }
    }

    // Try to post as PR review with inline comments
    try {
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })

        // Fetch PR diff to validate line numbers
        const { data: diffFiles } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: prNumber, per_page: 100,
        })

        // Build a set of valid (path, line) pairs from the diff
        const validLines = new Set<string>()
        for (const file of diffFiles) {
            if (!file.patch) continue
            const lines = file.patch.split('\n')
            let newLine = 0
            for (const line of lines) {
                const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/)
                if (hunkMatch) {
                    newLine = parseInt(hunkMatch[1], 10)
                    continue
                }
                if (line.startsWith('-')) continue // deleted line, skip
                if (line.startsWith('+') || !line.startsWith('\\')) {
                    validLines.add(`${file.filename}:${newLine}`)
                    newLine++
                }
            }
        }

        const reviewComments = result.inlineComments
            .filter(c => {
                if (!c.path || c.line <= 0) return false
                // Check if exact line is in diff, or try nearby lines (±3)
                if (validLines.has(`${c.path}:${c.line}`)) return true
                for (let offset = 1; offset <= 3; offset++) {
                    if (validLines.has(`${c.path}:${c.line + offset}`)) {
                        c.line = c.line + offset
                        return true
                    }
                    if (validLines.has(`${c.path}:${c.line - offset}`)) {
                        c.line = c.line - offset
                        return true
                    }
                }
                console.warn(`Skipping comment on ${c.path}:${c.line} — line not in diff`)
                return false
            })
            .slice(0, 50)
            .map(c => {
                let commentBody = c.body
                if (c.suggested_fix) {
                    commentBody += `\n\n\`\`\`suggestion\n${c.suggested_fix}\n\`\`\``
                }
                return { path: c.path, line: c.line, side: c.side as 'RIGHT', body: commentBody }
            })

        if (reviewComments.length > 0) {
            await octokit.rest.pulls.createReview({
                owner, repo,
                pull_number: prNumber,
                commit_id: pr.head.sha,
                body,
                event: result.verdict as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
                comments: reviewComments,
            })
            console.log(`Posted PR review with ${reviewComments.length} inline comments, verdict: ${result.verdict}`)
        } else {
            // No valid inline comments — post body as a comment
            if (result.inlineComments.length > 0) {
                body += `### Inline Comments\n\n`
                for (const c of result.inlineComments) {
                    body += `- \`${c.path}:${c.line}\` ${c.body}`
                    if (c.suggested_fix) {
                        body += `\n  \`\`\`suggestion\n  ${c.suggested_fix}\n  \`\`\``
                    }
                    body += '\n'
                }
            }
            await octokit.rest.issues.createComment({
                owner, repo, issue_number: prNumber, body,
            })
            console.log(`Posted review as comment (no valid inline lines)`)
        }
    } catch (err: any) {
        // Fallback: post as issue comment
        console.warn(`Failed to post PR review: ${err.message}. Falling back to comment.`)

        if (result.inlineComments.length > 0) {
            body += `### Inline Comments\n\n`
            for (const c of result.inlineComments) {
                body += `- \`${c.path}:${c.line}\` ${c.body}`
                if (c.suggested_fix) {
                    body += `\n  \`\`\`suggestion\n  ${c.suggested_fix}\n  \`\`\``
                }
                body += '\n'
            }
        }

        await octokit.rest.issues.createComment({
            owner, repo, issue_number: prNumber, body,
        })
    }

    // Update triggering comment
    if (commentId) {
        try {
            await octokit.rest.issues.updateComment({
                owner, repo,
                comment_id: commentId,
                body: `Archon review completed. Verdict: **${result.verdict}**\n\n${result.summary}`,
            })
        } catch { /* non-fatal */ }
    }
}

// ── GitHub API Helpers (branch, commit, delete) ──────────────────────

export async function createBranch(
    octokit: Octokit, owner: string, repo: string,
    branchName: string, baseBranch: string
): Promise<void> {
    // Get the SHA of the base branch
    const { data: ref } = await octokit.rest.git.getRef({
        owner, repo, ref: `heads/${baseBranch}`,
    })

    try {
        await octokit.rest.git.createRef({
            owner, repo,
            ref: `refs/heads/${branchName}`,
            sha: ref.object.sha,
        })
        console.log(`Created branch ${branchName} from ${baseBranch} (${ref.object.sha.substring(0, 7)})`)
    } catch (err: any) {
        // Branch already exists — force-reset it to the current base SHA so we get a clean state
        if (err.status === 422 || err.message?.toLowerCase().includes("reference already exists")) {
            console.log(`Branch ${branchName} already exists — resetting to ${baseBranch}`)
            await octokit.rest.git.updateRef({
                owner, repo,
                ref: `heads/${branchName}`,
                sha: ref.object.sha,
                force: true,
            })
        } else {
            throw err
        }
    }
}

export function buildCommitMessage(
    path: string, customMessage?: string, coAuthor?: { name: string; email: string }
): string {
    let msg = customMessage || `fix: update ${path}`
    msg += `\n\nCo-authored-by: Archon <archon-bot@users.noreply.github.com>`
    if (coAuthor) {
        msg += `\nCo-authored-by: ${coAuthor.name} <${coAuthor.email}>`
    }
    return msg
}

export async function commitFile(
    octokit: Octokit, owner: string, repo: string,
    branch: string, path: string, content: string, isNew: boolean,
    commitMessage?: string, coAuthor?: { name: string; email: string }
): Promise<void> {
    // For updates, we need the existing file's SHA
    let sha: string | undefined
    if (!isNew) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path, ref: branch,
            })
            if ('sha' in data) sha = data.sha
        } catch {
            // File doesn't exist on this branch yet — treat as create
        }
    }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo, path, branch,
        message: buildCommitMessage(path, commitMessage, coAuthor),
        content: Buffer.from(content, 'utf-8').toString('base64'),
        ...(sha ? { sha } : {}),
    })
}

export async function deleteFile(
    octokit: Octokit, owner: string, repo: string,
    branch: string, path: string, coAuthor?: { name: string; email: string }
): Promise<void> {
    const { data } = await octokit.rest.repos.getContent({
        owner, repo, path, ref: branch,
    })
    if ('sha' in data) {
        await octokit.rest.repos.deleteFile({
            owner, repo, path, branch,
            message: buildCommitMessage(path, `fix: remove ${path}`, coAuthor),
            sha: data.sha,
        })
    }
}

export async function fetchFileContentsForResolve(
    octokit: Octokit, owner: string, repo: string,
    filePaths: string[], ref: string
): Promise<Map<string, string>> {
    const contents = new Map<string, string>()
    const capped = filePaths.slice(0, 20) // Cap at 20 files
    const results = await fetchFilesParallel(octokit, owner, repo, ref, capped, {
        maxFileSize: 50000,
    })
    for (const result of results) {
        if (result.contents) {
            contents.set(result.path, result.contents)
        }
    }
    return contents
}
