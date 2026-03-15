/**
 * PR context fetching: full context, incremental diff, linked issues.
 */
import { Octokit } from "@octokit/rest"
import { fetchFilesParallel } from "../parallel-fetch.js"
import { db } from "../../db/client.js"
import { reviewResults } from "../../db/schema.js"
import { eq, and, desc } from "drizzle-orm"
import type { FileChange, PRContext } from "./types.js"

export async function fetchPRContext(
    octokit: Octokit, owner: string, repo: string, prNumber: number
): Promise<PRContext> {
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })

    // Fetch diff
    const { data: diff } = await octokit.rest.pulls.get({
        owner, repo, pull_number: prNumber,
        mediaType: { format: 'diff' as any },
    })

    // Fetch changed files
    const allFiles: any[] = []
    let page = 1
    while (true) {
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: prNumber, per_page: 100, page,
        })
        allFiles.push(...files)
        if (files.length < 100) break
        page++
    }

    console.log(`Found ${allFiles.length} changed files in PR #${prNumber}`)

    const filesChanged: FileChange[] = allFiles.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch || '',
    }))

    // Fetch full file contents for moderate-size files (parallel)
    const eligibleFiles = filesChanged.filter(f => f.status !== 'removed' && (f.additions + f.deletions) < 500)
    const fetched = await fetchFilesParallel(octokit, owner, repo, pr.head.sha, eligibleFiles.map(f => f.filename))
    for (const result of fetched) {
        if (result.contents) {
            const file = filesChanged.find(f => f.filename === result.path)
            if (file) file.contents = result.contents
        }
    }

    return {
        number: prNumber,
        title: pr.title,
        body: pr.body || '',
        diff: diff as unknown as string,
        filesChanged,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        headSha: pr.head.sha,
        author: pr.user?.login || 'unknown',
    }
}

export async function fetchIncrementalDiff(
    octokit: Octokit, owner: string, repo: string,
    prNumber: number, baseSha: string
): Promise<PRContext | null> {
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })

    const { data: comparison } = await octokit.rest.repos.compareCommits({
        owner, repo, base: baseSha, head: pr.head.sha,
    })

    if (!comparison.files || comparison.files.length === 0) {
        return null
    }

    const filesChanged: FileChange[] = comparison.files.map((f: any) => ({
        filename: f.filename,
        status: f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch: f.patch || '',
    }))

    // Fetch full file contents for moderate-size files (parallel)
    const eligibleIncr = filesChanged.filter(f => f.status !== 'removed' && (f.additions + f.deletions) < 500)
    const fetchedIncr = await fetchFilesParallel(octokit, owner, repo, pr.head.sha, eligibleIncr.map(f => f.filename))
    for (const result of fetchedIncr) {
        if (result.contents) {
            const file = filesChanged.find(f => f.filename === result.path)
            if (file) file.contents = result.contents
        }
    }

    return {
        number: prNumber,
        title: pr.title,
        body: pr.body || '',
        diff: comparison.files.map((f: any) => f.patch || '').join('\n'),
        filesChanged,
        baseBranch: pr.base.ref,
        headBranch: pr.head.ref,
        headSha: pr.head.sha,
        author: pr.user?.login || 'unknown',
    }
}

export async function getLastReviewedSha(
    orgId: string, repo: string, prNumber: number
): Promise<string | null> {
    const lastReview = await db.query.reviewResults.findFirst({
        where: and(
            eq(reviewResults.orgId, orgId),
            eq(reviewResults.repo, repo),
            eq(reviewResults.issueNumber, prNumber),
            eq(reviewResults.actionType, 'review'),
            eq(reviewResults.status, 'completed'),
        ),
        orderBy: [desc(reviewResults.completedAt)],
    })
    return lastReview?.headSha || null
}

export function extractLinkedIssueNumbers(prBody: string, prTitle: string): number[] {
    const patterns = [
        /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi,
        /(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+https?:\/\/github\.com\/[^/]+\/[^/]+\/issues\/(\d+)/gi,
    ]

    const issueNumbers = new Set<number>()
    const text = `${prTitle} ${prBody}`

    for (const pattern of patterns) {
        let match
        while ((match = pattern.exec(text)) !== null) {
            issueNumbers.add(parseInt(match[1], 10))
        }
    }

    // Fallback: #N references in body
    if (issueNumbers.size === 0) {
        const fallback = /#(\d+)/g
        let match
        while ((match = fallback.exec(prBody)) !== null) {
            issueNumbers.add(parseInt(match[1], 10))
        }
    }

    return Array.from(issueNumbers)
}

export async function fetchLinkedIssue(
    octokit: Octokit, owner: string, repo: string, prBody: string, prTitle: string
): Promise<{ number: number; title: string; body: string } | null> {
    const nums = extractLinkedIssueNumbers(prBody, prTitle)
    if (nums.length === 0) return null

    for (const num of nums) {
        try {
            const { data: issue } = await octokit.rest.issues.get({ owner, repo, issue_number: num })
            if (issue.pull_request) continue // Skip PRs
            return { number: num, title: issue.title, body: issue.body || '' }
        } catch { /* not found */ }
    }
    return null
}
