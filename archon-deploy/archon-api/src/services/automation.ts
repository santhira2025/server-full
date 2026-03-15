import { Octokit } from "@octokit/rest"
import crypto from "crypto"
import { db } from "../db/client.js"
import { developerProfiles, learningEvents, prRiskScores, releaseNotes } from "../db/schema.js"
import { eq } from "drizzle-orm"

export interface PrRiskResult {
    score: number
    level: "low" | "medium" | "high"
    reasons: string[]
    reviewer?: string
}

interface ParsedRule {
    name: string
    when: string
    unless?: string
    action: "comment" | "request_changes" | "add_label"
    message: string
}

export function deriveAutoLabels(files: string[]): string[] {
    const labels = new Set<string>()

    if (files.some((f) => /^test\/|\/test\/|\.test\./.test(f))) labels.add("tests")
    if (files.some((f) => /package\.json|requirements\.txt|go\.mod|pnpm-lock|package-lock|poetry\.lock/i.test(f))) labels.add("dependencies")
    if (files.some((f) => /auth|security|jwt|token|crypto|webhook/i.test(f))) labels.add("needs-security-review")
    if (files.some((f) => /payment|billing|checkout|invoice|stripe/i.test(f))) labels.add("payments")
    if (files.some((f) => /schema|migration|sql|prisma|drizzle/i.test(f))) labels.add("database")
    if (files.some((f) => /^docs\/|README|\.md$/i.test(f))) labels.add("docs")
    if (labels.size === 0) labels.add("feature")

    return Array.from(labels)
}

export function buildPrDescription(payload: {
    title: string
    files: Array<{ filename: string; status: string; additions: number; deletions: number }>
}): string {
    const changed = payload.files.slice(0, 8)
    const changes = changed
        .map((f) => `- \`${f.filename}\` - ${f.status} (+${f.additions} / -${f.deletions})`)
        .join("\n")
    const testingHints: string[] = []

    if (payload.files.some((f) => /auth|token|security|webhook/i.test(f.filename))) {
        testingHints.push("- [ ] Validate auth/security edge cases")
    }
    if (payload.files.some((f) => /schema|migration|sql|db/i.test(f.filename))) {
        testingHints.push("- [ ] Run DB migration and rollback test")
    }
    if (payload.files.some((f) => /^test\/|\/test\/|\.test\./.test(f.filename))) {
        testingHints.push("- [ ] Ensure updated tests pass in CI")
    }
    if (testingHints.length === 0) {
        testingHints.push("- [ ] Verify happy path", "- [ ] Verify failure path")
    }

    return `## What this PR does
${payload.title}

## Changes
${changes}

## Testing
${testingHints.join("\n")}
`
}

const KNOWN_DEPENDENCY_RISKS: Record<string, string> = {
    "crypto-js@4.1": "Known CVE-2023-46233 risk pattern. Prefer built-in crypto primitives.",
}

function normalizeSemver(value: string): string {
    return value.replace(/^[~^><= ]+/, "").trim()
}

function parseDependencyPatch(patch: string): Array<{ name: string; from?: string; to?: string; kind: "added" | "updated" | "removed" }> {
    const changes: Array<{ name: string; from?: string; to?: string; kind: "added" | "updated" | "removed" }> = []
    const minus: Record<string, string> = {}
    const plus: Record<string, string> = {}

    for (const line of patch.split("\n")) {
        const depMatch = line.match(/^[+-]\s*"([^"]+)"\s*:\s*"([^"]+)"/)
        if (!depMatch) continue
        const [, name, rawVersion] = depMatch
        const version = normalizeSemver(rawVersion)
        if (line.startsWith("-")) minus[name] = version
        if (line.startsWith("+")) plus[name] = version
    }

    const all = new Set([...Object.keys(minus), ...Object.keys(plus)])
    for (const name of all) {
        if (minus[name] && plus[name]) {
            changes.push({ name, from: minus[name], to: plus[name], kind: "updated" })
        } else if (!minus[name] && plus[name]) {
            changes.push({ name, to: plus[name], kind: "added" })
        } else if (minus[name] && !plus[name]) {
            changes.push({ name, from: minus[name], kind: "removed" })
        }
    }

    return changes
}

function semverDelta(from: string, to: string): "major" | "minor" | "patch" | "unknown" {
    const a = from.split(".").map((x) => parseInt(x, 10))
    const b = to.split(".").map((x) => parseInt(x, 10))
    if (a.some(Number.isNaN) || b.some(Number.isNaN) || a.length < 3 || b.length < 3) return "unknown"
    if (a[0] !== b[0]) return "major"
    if (a[1] !== b[1]) return "minor"
    if (a[2] !== b[2]) return "patch"
    return "unknown"
}

export function buildDependencyAuditMarkdown(
    prNumber: number,
    files: Array<{ filename: string; patch?: string }>
): string | null {
    const depFiles = files.filter((f) =>
        /package\.json|requirements\.txt|go\.mod|pnpm-lock|package-lock|poetry\.lock/i.test(f.filename)
    )
    if (depFiles.length === 0) return null

    const rows: string[] = []
    for (const file of depFiles) {
        if (!file.patch) continue
        const parsed = parseDependencyPatch(file.patch)
        for (const change of parsed) {
            if (change.kind === "updated" && change.from && change.to) {
                const delta = semverDelta(change.from, change.to)
                const risk =
                    delta === "major"
                        ? "Breaking changes likely - review migration guide"
                        : delta === "minor"
                            ? "Moderate risk - validate behavior in tests"
                            : delta === "patch"
                                ? "Usually safe patch update"
                                : "Unknown version delta - manual review needed"
                rows.push(`| ${change.name} ${change.from} -> ${change.to} | ${delta} | ${risk} |`)
            } else if (change.kind === "added" && change.to) {
                const key = `${change.name}@${change.to}`
                const knownRisk = KNOWN_DEPENDENCY_RISKS[key]
                rows.push(`| NEW: ${change.name} ${change.to} | added | ${knownRisk || "Review license, maintenance, and advisories"} |`)
            } else if (change.kind === "removed" && change.from) {
                rows.push(`| REMOVED: ${change.name} ${change.from} | removed | Verify transitive usage is gone |`)
            }
        }
    }

    if (rows.length === 0) return null

    return `## Dependency Changes in PR #${prNumber}

| Package | Change | Risk |
|---|---|---|
${rows.join("\n")}

Checked by Archon (manifest diff + known advisory patterns).`
}

function riskLevel(score: number): "low" | "medium" | "high" {
    if (score >= 70) return "high"
    if (score >= 40) return "medium"
    return "low"
}

function domainFromFile(file: string): string[] {
    const lower = file.toLowerCase()
    const domains: string[] = []
    if (/security|auth|token|crypto|webhook/.test(lower)) domains.push("security")
    if (/schema|migration|sql|db|database/.test(lower)) domains.push("database")
    if (/payment|billing|checkout|invoice|wallet/.test(lower)) domains.push("payments")
    if (/api|route|controller|service/.test(lower)) domains.push("backend")
    if (/test/.test(lower)) domains.push("testing")
    return domains
}

export async function calculatePrRiskAndReviewer(options: {
    orgId: string
    repoFullName: string
    prNumber: number
    author: string
    files: Array<{ filename: string; additions: number; deletions: number }>
}): Promise<PrRiskResult> {
    const { orgId, repoFullName, prNumber, author, files } = options
    const reasons: string[] = []
    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0)
    const uniqueFiles = files.map((f) => f.filename)

    let score = 15 + Math.min(30, Math.round(totalLines / 20))
    reasons.push(`PR changes ${totalLines} lines across ${files.length} files`)

    const sensitiveFiles = files.filter((f) => /webhook|auth|token|payment|billing|schema|migration|security/i.test(f.filename))
    if (sensitiveFiles.length > 0) {
        score += Math.min(25, sensitiveFiles.length * 8)
        reasons.push(`Touches sensitive files: ${sensitiveFiles.slice(0, 3).map((f) => f.filename).join(", ")}`)
    }

    const profile = await db.query.developerProfiles.findFirst({
        where: eq(developerProfiles.id, `${orgId}:${author}`),
    })

    const skill = profile?.skillLevel || "mid"
    if (skill === "junior") {
        score += 15
        reasons.push("Author profile indicates junior level")
    } else if (skill === "mid") {
        score += 5
        reasons.push("Author profile indicates mid level")
    }

    const history = await db.query.learningEvents.findMany({
        where: eq(learningEvents.orgId, orgId),
    })
    const repeatedInHotFiles = history.filter((ev) => ev.repo === repoFullName && ev.filePath && uniqueFiles.includes(ev.filePath)).length
    if (repeatedInHotFiles > 0) {
        score += Math.min(20, repeatedInHotFiles * 2)
        reasons.push(`Files in this PR have ${repeatedInHotFiles} prior learning incidents`)
    }

    score = Math.max(0, Math.min(100, score))

    const candidates = await db.query.developerProfiles.findMany({
        where: eq(developerProfiles.orgId, orgId),
    })
    const authorLower = author.toLowerCase()
    const changedDomains = new Set(files.flatMap((f) => domainFromFile(f.filename)))

    let bestReviewer: { login: string; score: number } | null = null
    for (const candidate of candidates) {
        if (candidate.githubLogin.toLowerCase() === authorLower) continue

        const strongAreas = (candidate.strongAreas as Record<string, number>) || {}
        const weakAreas = (candidate.weakAreas as Record<string, number>) || {}
        let reviewerScore = candidate.securityScore || 50

        for (const domain of changedDomains) {
            reviewerScore += (strongAreas[domain] || 0) * 4
            reviewerScore -= (weakAreas[domain] || 0) * 3
        }

        if ((candidate.skillLevel || "mid") === "senior") reviewerScore += 20
        if ((candidate.skillLevel || "mid") === "mid") reviewerScore += 10

        if (!bestReviewer || reviewerScore > bestReviewer.score) {
            bestReviewer = { login: candidate.githubLogin, score: reviewerScore }
        }
    }

    const result: PrRiskResult = {
        score,
        level: riskLevel(score),
        reasons,
        reviewer: bestReviewer?.login,
    }

    await db.insert(prRiskScores).values({
        id: crypto.randomUUID(),
        orgId,
        repo: repoFullName,
        prNumber,
        author,
        riskScore: result.score,
        riskLevel: result.level,
        reasons: result.reasons,
        recommendedReviewer: result.reviewer || null,
    })

    return result
}

function globToRegExp(glob: string): RegExp {
    const escaped = glob
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "__GLOBSTAR__")
        .replace(/\*/g, "[^/]*")
        .replace(/__GLOBSTAR__/g, ".*")
    return new RegExp(`^${escaped}$`)
}

function parseRulesYaml(content: string): ParsedRule[] {
    const lines = content.split("\n")
    const rules: ParsedRule[] = []
    let current: Partial<ParsedRule> | null = null

    for (const raw of lines) {
        const line = raw.trim()
        if (!line || line.startsWith("#")) continue

        if (line.startsWith("- name:")) {
            if (current?.name && current.when && current.action && current.message) {
                rules.push(current as ParsedRule)
            }
            current = {
                name: line.replace("- name:", "").trim(),
                action: "comment",
            }
            continue
        }
        if (!current) continue

        if (line.startsWith("name:")) current.name = line.replace("name:", "").trim()
        if (line.startsWith("when:")) current.when = line.replace("when:", "").trim()
        if (line.startsWith("unless:")) current.unless = line.replace("unless:", "").trim()
        if (line.startsWith("action:")) {
            const action = line.replace("action:", "").trim()
            if (action === "comment" || action === "request_changes" || action === "add_label") {
                current.action = action
            }
        }
        if (line.startsWith("message:")) {
            current.message = line.replace("message:", "").trim().replace(/^"|"$/g, "")
        }
    }

    if (current?.name && current.when && current.action && current.message) {
        rules.push(current as ParsedRule)
    }

    return rules
}

function safeEvalBooleanExpression(expression: string): boolean {
    const normalized = expression
        .replace(/\bAND\b/g, "&&")
        .replace(/\bOR\b/g, "||")
        .replace(/\bNOT\b/g, "!")
    const suspicious = /[^a-z0-9_().<>=!&|"' \-]/i.test(normalized)
    if (suspicious) return false
    try {
        return Boolean(Function(`"use strict"; return (${normalized});`)())
    } catch {
        return false
    }
}

function evaluateRuleExpression(
    expression: string,
    context: { files: string[]; baseBranch: string; labels: string[]; linesChanged: number }
): boolean {
    let expr = expression
    expr = expr.replace(/files_changed\("([^"]+)"\)/g, (_m, pattern) => {
        const regex = globToRegExp(pattern)
        return String(context.files.some((f) => regex.test(f)))
    })
    expr = expr.replace(/base_branch\("([^"]+)"\)/g, (_m, branch) => String(context.baseBranch === branch))
    expr = expr.replace(/label\("([^"]+)"\)/g, (_m, label) => String(context.labels.includes(label)))
    expr = expr.replace(/\blines_changed\b/g, String(context.linesChanged))
    return safeEvalBooleanExpression(expr)
}

export async function applyRepoRules(options: {
    octokit: Octokit
    owner: string
    repo: string
    prNumber: number
    baseBranch: string
    labels: string[]
    files: string[]
    linesChanged: number
    headSha: string
}): Promise<{ applied: string[] }> {
    const { octokit, owner, repo, prNumber, baseBranch, labels, files, linesChanged, headSha } = options
    let content = ""
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner,
            repo,
            path: ".archon/rules.yml",
            ref: headSha,
        })
        if ("content" in data && typeof data.content === "string") {
            content = Buffer.from(data.content, "base64").toString("utf-8")
        }
    } catch {
        return { applied: [] }
    }

    if (!content.trim()) return { applied: [] }

    const parsedRules = parseRulesYaml(content)
    const applied: string[] = []
    for (const rule of parsedRules) {
        const whenPass = evaluateRuleExpression(rule.when, { files, baseBranch, labels, linesChanged })
        if (!whenPass) continue
        if (rule.unless && evaluateRuleExpression(rule.unless, { files, baseBranch, labels, linesChanged })) {
            continue
        }

        applied.push(rule.name)
        const rendered = rule.message.replace(/\{\{lines_changed\}\}/g, String(linesChanged))
        if (rule.action === "comment") {
            await octokit.rest.issues.createComment({
                owner,
                repo,
                issue_number: prNumber,
                body: `Rule \`${rule.name}\`: ${rendered}`,
            })
        } else if (rule.action === "request_changes") {
            await octokit.rest.pulls.createReview({
                owner,
                repo,
                pull_number: prNumber,
                event: "REQUEST_CHANGES",
                body: `Rule \`${rule.name}\`: ${rendered}`,
            })
        } else if (rule.action === "add_label") {
            await octokit.rest.issues.addLabels({
                owner,
                repo,
                issue_number: prNumber,
                labels: [rendered],
            })
        }
    }

    return { applied }
}

export async function buildCiFailureAnalysis(options: {
    octokit: Octokit
    owner: string
    repo: string
    ref: string
    prNumber?: number
}): Promise<string> {
    const { octokit, owner, repo, ref, prNumber } = options
    const { data } = await octokit.rest.checks.listForRef({ owner, repo, ref, per_page: 50 })
    const failed = data.check_runs.filter((run) => run.conclusion === "failure")
    if (failed.length === 0) {
        return "CI completed without failing check runs."
    }

    const lines = failed.slice(0, 5).map((run) => {
        const title = run.name || "Unnamed check"
        const summary = run.output?.summary?.split("\n")[0] || "No summary provided"
        return `- ${title}: ${summary}`
    })

    let hint = ""
    if (prNumber) {
        try {
            const { data: files } = await octokit.rest.pulls.listFiles({
                owner,
                repo,
                pull_number: prNumber,
                per_page: 100,
            })
            const touched = files.map((f) => f.filename).slice(0, 5).join(", ")
            hint = `\nChanged files in PR #${prNumber}: ${touched}`
        } catch {
            // non-fatal
        }
    }

    return `## CI Failure Analysis

Detected failing checks:
${lines.join("\n")}
${hint}

Run \`/archon resolve\` to attempt an automated fix.`
}

function categorizePr(pr: any): "feature" | "security" | "breaking" {
    const title = (pr.title || "").toLowerCase()
    const labels = (pr.labels || []).map((l: any) => (typeof l === "string" ? l : l.name || "").toLowerCase())
    if (title.includes("breaking") || title.includes("!")) return "breaking"
    if (labels.some((l: string) => l.includes("security")) || /cve|xss|sql injection|vulnerability/.test(title)) return "security"
    return "feature"
}

export async function generateAndStoreReleaseNotes(options: {
    octokit: Octokit
    orgId: string
    owner: string
    repo: string
    tagName: string
}): Promise<{ notes: string; prCount: number }> {
    const { octokit, orgId, owner, repo, tagName } = options
    const { data: tags } = await octokit.rest.repos.listTags({ owner, repo, per_page: 20 })
    const current = tags.find((t) => t.name === tagName) || tags[0]
    const previous = tags.find((t) => t.name !== current?.name)

    let sinceDate: string | null = null
    if (previous?.name) {
        try {
            const { data: previousCommit } = await octokit.rest.repos.getCommit({
                owner,
                repo,
                ref: previous.name,
            })
            sinceDate = previousCommit.commit.committer?.date || null
        } catch {
            sinceDate = null
        }
    }

    const { data: pulls } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: "closed",
        sort: "updated",
        direction: "desc",
        per_page: 100,
        base: "main",
    })
    const merged = pulls.filter((pr) => {
        if (!pr.merged_at) return false
        if (!sinceDate) return true
        return new Date(pr.merged_at).getTime() >= new Date(sinceDate).getTime()
    })

    const features = merged.filter((pr) => categorizePr(pr) === "feature")
    const security = merged.filter((pr) => categorizePr(pr) === "security")
    const breaking = merged.filter((pr) => categorizePr(pr) === "breaking")
    const date = new Date().toISOString().split("T")[0]

    const toLine = (pr: any) => `- ${pr.title} (#${pr.number})`

    let notes = `## ${tagName} - ${date}\n\n`
    if (features.length > 0) notes += `### Features\n${features.map(toLine).join("\n")}\n\n`
    if (security.length > 0) notes += `### Security Fixes\n${security.map(toLine).join("\n")}\n\n`
    if (breaking.length > 0) notes += `### Breaking Changes\n${breaking.map(toLine).join("\n")}\n\n`
    notes += `Generated by Archon from ${merged.length} merged PRs${previous?.name ? ` since ${previous.name}` : ""}.`

    await db.insert(releaseNotes).values({
        id: crypto.randomUUID(),
        orgId,
        repo: `${owner}/${repo}`,
        tag: tagName,
        fromTag: previous?.name || null,
        toTag: current?.name || tagName,
        notes,
        prCount: merged.length,
    })

    return { notes, prCount: merged.length }
}

export function buildRiskComment(prNumber: number, author: string, risk: PrRiskResult): string {
    const urgency = risk.level === "high" ? "URGENT" : risk.level === "medium" ? "NORMAL" : "LOW"
    return `PR #${prNumber} opened by @${author}
Risk Score: ${risk.score}/100 (${risk.level.toUpperCase()})
Why: ${risk.reasons.join("; ")}
Auto-assigned: ${risk.reviewer ? `@${risk.reviewer}` : "none"}
Review priority: ${urgency}`
}
