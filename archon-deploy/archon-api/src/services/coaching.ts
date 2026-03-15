/**
 * Archon Coach — Developer learning & skill tracking service.
 * Tracks mistake patterns per developer, builds skill profiles,
 * and generates personalized coaching context for review prompts.
 */
import { db } from "../db/client.js"
import { developerProfiles, learningEvents, reviewerPreferences } from "../db/schema.js"
import crypto from "crypto"
import { eq, and, desc, sql, gte } from "drizzle-orm"

// ── Types ─────────────────────────────────────────────────────────────

export interface DeveloperProfile {
    id: string
    orgId: string
    githubLogin: string
    skillLevel: string
    weakAreas: Record<string, number>
    strongAreas: Record<string, number>
    totalReviews: number
    totalIssuesFound: number
    repeatedMistakes: number
    securityScore: number
}

export interface InlineCommentForCoaching {
    path: string
    line: number
    body: string
    severity: string
}

export interface SecurityIssueForCoaching {
    severity: string
    file: string
    line: number
    description: string
}

// Systemic impact map — connects mistake categories to system-level consequences
const SYSTEMIC_INSIGHTS: Record<string, string> = {
    sql_injection: 'SQL injection in API routes could expose your entire database via a single crafted request — all tables, not just the queried one.',
    missing_error_handling: 'Unhandled exceptions in the service layer bubble up as 500 errors to every caller — a single unguarded await can take down an entire request path.',
    missing_input_validation: 'Unvalidated input at one entry point propagates invalid data through the entire pipeline — downstream services and the database will receive corrupt data.',
    hardcoded_secrets: 'A hardcoded credential committed to the repo is permanently exposed in git history even after removal — rotation is required after every occurrence.',
    xss: 'XSS in one component can be used to steal session tokens across the entire app, not just the affected page.',
    race_condition: 'Race conditions in shared state can corrupt data for all concurrent users — the failure is non-deterministic and hard to reproduce.',
    memory_leak: 'Memory leaks compound over time — a leak in a frequently-called path will cause the service to degrade and eventually crash under load.',
    missing_null_check: 'A missing null check in a hot path will cause cascading NullReferenceErrors whenever upstream data is absent — often in production, rarely in tests.',
    command_injection: 'Command injection gives an attacker shell access to the server — this is a full system compromise, not just data exposure.',
    path_traversal: 'Path traversal can expose any file the process has read access to, including environment files, private keys, and source code.',
    insecure_crypto: 'Weak hashing (MD5/SHA1) means password databases can be cracked offline in hours — all user accounts are compromised, not just one.',
    type_safety: 'Unsafe type assertions spread through the codebase — a single `as any` can mask runtime errors that only surface at the call site in production.',
    performance: 'N+1 queries and O(n²) algorithms scale poorly — what works fine locally will cause timeouts under real traffic as data grows.',
    missing_edge_cases: 'Happy-path-only code fails at boundaries — empty arrays, zero values, and concurrent requests all exercise code paths tests never cover.',
}

// Mistake categories we track — maps keywords in review comments to categories
const MISTAKE_CATEGORIES: Record<string, string[]> = {
    sql_injection: ['sql injection', 'parameterized', 'prepared statement', 'sql query', 'query concatenation'],
    xss: ['xss', 'cross-site scripting', 'innerHTML', 'dangerouslySetInnerHTML', 'unsanitized', 'sanitize input'],
    missing_error_handling: ['error handling', 'try/catch', 'unhandled', 'no error', 'catch block', 'error boundary', 'bare except'],
    missing_input_validation: ['input validation', 'validate input', 'no validation', 'unchecked input', 'user input'],
    hardcoded_secrets: ['hardcoded', 'api key', 'secret', 'password', 'credential', 'token in code'],
    missing_null_check: ['null check', 'undefined check', 'nullable', 'optional chaining', 'null reference'],
    race_condition: ['race condition', 'concurrency', 'thread safety', 'atomic', 'mutex'],
    memory_leak: ['memory leak', 'cleanup', 'dispose', 'unsubscribe', 'removeEventListener'],
    generic_naming: ['generic name', 'naming', 'variable name', 'descriptive name', 'unclear name'],
    missing_edge_cases: ['edge case', 'boundary', 'corner case', 'empty array', 'zero length'],
    outdated_pattern: ['deprecated', 'outdated', 'legacy', 'old syntax', 'modern alternative'],
    over_abstraction: ['over-abstraction', 'premature abstraction', 'unnecessary abstraction', 'too abstract'],
    insecure_crypto: ['crypto', 'encryption', 'hash', 'md5', 'sha1', 'weak algorithm'],
    path_traversal: ['path traversal', 'directory traversal', '../', 'file path'],
    command_injection: ['command injection', 'exec(', 'shell injection', 'subprocess'],
    type_safety: ['type safety', 'any type', 'type assertion', 'type cast', 'type error'],
    performance: ['performance', 'n+1', 'slow query', 'optimization', 'inefficient', 'O(n^2)'],
    accessibility: ['accessibility', 'a11y', 'aria', 'alt text', 'screen reader'],
}

// ── Profile Management ────────────────────────────────────────────────

export async function getDeveloperProfile(orgId: string, githubLogin: string): Promise<DeveloperProfile> {
    const profileId = `${orgId}:${githubLogin}`

    const existing = await db.query.developerProfiles.findFirst({
        where: eq(developerProfiles.id, profileId),
    })

    if (existing) {
        return {
            id: existing.id,
            orgId: existing.orgId || orgId,
            githubLogin: existing.githubLogin,
            skillLevel: existing.skillLevel || 'mid',
            weakAreas: (existing.weakAreas as Record<string, number>) || {},
            strongAreas: (existing.strongAreas as Record<string, number>) || {},
            totalReviews: existing.totalReviews || 0,
            totalIssuesFound: existing.totalIssuesFound || 0,
            repeatedMistakes: existing.repeatedMistakes || 0,
            securityScore: existing.securityScore || 50,
        }
    }

    // Create new profile
    await db.insert(developerProfiles).values({
        id: profileId,
        orgId,
        githubLogin,
        skillLevel: 'mid',
        weakAreas: {},
        strongAreas: {},
        totalReviews: 0,
        totalIssuesFound: 0,
        repeatedMistakes: 0,
        securityScore: 50,
    })

    return {
        id: profileId,
        orgId,
        githubLogin,
        skillLevel: 'mid',
        weakAreas: {},
        strongAreas: {},
        totalReviews: 0,
        totalIssuesFound: 0,
        repeatedMistakes: 0,
        securityScore: 50,
    }
}

/**
 * Categorize an inline comment into a mistake type based on keyword matching.
 */
function categorizeMistake(comment: string): string | null {
    const lower = comment.toLowerCase()
    for (const [category, keywords] of Object.entries(MISTAKE_CATEGORIES)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category
        }
    }
    return null
}

/**
 * After a review completes, update the developer's profile with new findings.
 */
export async function updateDeveloperProfile(
    orgId: string,
    githubLogin: string,
    repo: string,
    prNumber: number,
    inlineComments: InlineCommentForCoaching[],
    securityIssues: SecurityIssueForCoaching[],
): Promise<{ newMistakes: string[]; repeatedMistakes: string[]; learningSummary: string }> {
    const profileId = `${orgId}:${githubLogin}`
    const profile = await getDeveloperProfile(orgId, githubLogin)

    const newMistakes: string[] = []
    const repeatedMistakes: string[] = []
    const mistakeCounts: Record<string, number> = {}
    // Track which categories we've already classified for THIS PR (prevents duplicate counting)
    const classifiedCategories = new Set<string>()
    // Collect deduplicated learning events (one per category per PR)
    const pendingEvents: Array<{
        category: string; severity: string; wasRepeated: boolean;
        filePath: string; lineNumber: number; description: string;
    }> = []

    // Categorize each inline comment
    for (const comment of inlineComments) {
        if (comment.severity === 'info' || comment.severity === 'suggestion') continue
        const category = categorizeMistake(comment.body)
        if (!category) continue

        mistakeCounts[category] = (mistakeCounts[category] || 0) + 1

        // Only classify and log once per category per PR to avoid duplicates
        if (!classifiedCategories.has(category)) {
            classifiedCategories.add(category)
            const wasRepeated = (profile.weakAreas[category] || 0) > 0
            if (wasRepeated) {
                repeatedMistakes.push(category)
            } else {
                newMistakes.push(category)
            }
            pendingEvents.push({
                category, severity: comment.severity, wasRepeated,
                filePath: comment.path, lineNumber: comment.line,
                description: comment.body.substring(0, 500),
            })
        }
    }

    // Also track security issues
    for (const issue of securityIssues) {
        const category = categorizeMistake(issue.description) || `security_${issue.severity}`
        mistakeCounts[category] = (mistakeCounts[category] || 0) + 1

        if (!classifiedCategories.has(category)) {
            classifiedCategories.add(category)
            const wasRepeated = (profile.weakAreas[category] || 0) > 0
            if (wasRepeated) repeatedMistakes.push(category)
            else newMistakes.push(category)
            pendingEvents.push({
                category, severity: issue.severity, wasRepeated,
                filePath: issue.file, lineNumber: issue.line,
                description: issue.description.substring(0, 500),
            })
        }
    }

    // Insert deduplicated learning events
    for (const evt of pendingEvents) {
        await db.insert(learningEvents).values({
            id: crypto.randomUUID(),
            orgId,
            githubLogin,
            repo,
            prNumber,
            mistakeType: evt.category,
            severity: evt.severity,
            wasRepeated: evt.wasRepeated,
            filePath: evt.filePath,
            lineNumber: evt.lineNumber,
            description: evt.description,
        })
    }

    // Update weak areas (accumulate counts)
    const updatedWeakAreas = { ...profile.weakAreas }
    for (const [category, count] of Object.entries(mistakeCounts)) {
        updatedWeakAreas[category] = (updatedWeakAreas[category] || 0) + count
    }

    // Detect strong areas: categories from previous reviews with 0 new issues
    const updatedStrongAreas = { ...profile.strongAreas }
    for (const category of Object.keys(profile.weakAreas)) {
        if (!mistakeCounts[category] && profile.weakAreas[category] > 0) {
            updatedStrongAreas[category] = (updatedStrongAreas[category] || 0) + 1
        }
    }

    // Update security score
    const securityMistakes = securityIssues.filter(s => s.severity === 'critical' || s.severity === 'high').length
    let newSecurityScore = profile.securityScore
    if (securityMistakes > 0) {
        newSecurityScore = Math.max(0, newSecurityScore - securityMistakes * 10)
    } else if (inlineComments.length > 0) {
        // No security issues in a review = slight improvement
        newSecurityScore = Math.min(100, newSecurityScore + 2)
    }

    // Auto-detect skill level based on patterns
    //
    // Light heuristics from review 1: repeated-mistake ratio is a reliable early signal.
    // Full heuristics from review 3: avg mistakes/PR becomes meaningful with more data.
    const totalMistakeTypes = Object.keys(updatedWeakAreas).length
    const totalReviews = profile.totalReviews + 1
    const avgMistakesPerReview = (profile.totalIssuesFound + inlineComments.length) / totalReviews
    const uniqueRepeats = new Set(repeatedMistakes).size

    let skillLevel = profile.skillLevel
    if (totalReviews >= 1) {
        // Tier 1: basic categorisation from first review
        if (uniqueRepeats === 0 && inlineComments.length <= 1) {
            skillLevel = 'senior'
        } else if (uniqueRepeats <= 1 && inlineComments.length <= 3) {
            skillLevel = 'mid'
        } else {
            skillLevel = 'junior'
        }
    }
    if (totalReviews >= 3) {
        // Tier 2: use multi-review averages for better signal
        if (avgMistakesPerReview <= 1 && uniqueRepeats === 0) {
            skillLevel = 'senior'
        } else if (avgMistakesPerReview <= 3 && uniqueRepeats <= 1) {
            skillLevel = 'mid'
        } else {
            skillLevel = 'junior'
        }
    }

    // Save updated profile
    await db.update(developerProfiles)
        .set({
            skillLevel,
            weakAreas: updatedWeakAreas,
            strongAreas: updatedStrongAreas,
            totalReviews,
            totalIssuesFound: profile.totalIssuesFound + inlineComments.length + securityIssues.length,
            repeatedMistakes: profile.repeatedMistakes + new Set(repeatedMistakes).size,
            securityScore: newSecurityScore,
            lastReviewedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(developerProfiles.id, profileId))

    // Generate learning summary
    const learningSummary = generateLearningSummary(
        githubLogin, profile, updatedWeakAreas, newMistakes, repeatedMistakes,
        inlineComments.length, newSecurityScore, skillLevel
    )

    return {
        newMistakes: [...new Set(newMistakes)],
        repeatedMistakes: [...new Set(repeatedMistakes)],
        learningSummary,
    }
}

/**
 * Generate a markdown learning summary to append to the review comment.
 */
function generateLearningSummary(
    githubLogin: string,
    previousProfile: DeveloperProfile,
    updatedWeakAreas: Record<string, number>,
    newMistakes: string[],
    repeatedMistakes: string[],
    issuesThisReview: number,
    securityScore: number,
    skillLevel: string,
): string {
    const uniqueRepeats = [...new Set(repeatedMistakes)]
    const uniqueNew = [...new Set(newMistakes)]

    let summary = `\n\n---\n\n### Coach Summary for @${githubLogin}\n\n`

    // Stats line
    const totalReviews = previousProfile.totalReviews + 1
    const securityDelta = securityScore - previousProfile.securityScore
    const securityArrow = securityDelta > 0 ? '↑' : securityDelta < 0 ? '↓' : '→'
    summary += `**Reviews:** ${totalReviews} | **Security Score:** ${securityScore}/100 ${securityArrow} | **Issues this PR:** ${issuesThisReview}\n\n`

    // Repeated mistakes — most important section
    if (uniqueRepeats.length > 0) {
        summary += `**Repeated patterns** (seen in previous PRs):\n`
        for (const mistake of uniqueRepeats) {
            const count = updatedWeakAreas[mistake] || 0
            const label = mistake.replace(/_/g, ' ')
            summary += `- ${label} (${count}x total)\n`
        }
        summary += '\n'
    }

    // New mistakes
    if (uniqueNew.length > 0) {
        summary += `**New patterns to watch:**\n`
        for (const mistake of uniqueNew) {
            const label = mistake.replace(/_/g, ' ')
            summary += `- ${label}\n`
        }
        summary += '\n'
    }

    // Improvements (areas they used to struggle with but got right this time)
    const improvements: string[] = []
    for (const [area, count] of Object.entries(previousProfile.weakAreas)) {
        if (count >= 2 && (!updatedWeakAreas[area] || updatedWeakAreas[area] === previousProfile.weakAreas[area])) {
            // They had this as a weak area but didn't repeat it this PR
            if (previousProfile.strongAreas[area] && previousProfile.strongAreas[area] >= 2) {
                improvements.push(area)
            }
        }
    }
    if (improvements.length > 0) {
        summary += `**Improvements:** ${improvements.map(a => a.replace(/_/g, ' ')).join(', ')}\n\n`
    }

    // Top recommendation
    const topWeakAreas = Object.entries(updatedWeakAreas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

    if (topWeakAreas.length > 0 && totalReviews >= 3) {
        const topArea = topWeakAreas[0][0].replace(/_/g, ' ')
        summary += `**Focus area:** ${topArea} — this is your most common pattern across PRs.\n`
    }

    // Systemic impact — connect top mistakes to their broader consequences
    const systemicCategories = [...uniqueRepeats, ...uniqueNew]
        .filter(cat => SYSTEMIC_INSIGHTS[cat])
        .slice(0, 2)

    if (systemicCategories.length > 0) {
        summary += `\n**Systemic impact:**\n`
        for (const cat of systemicCategories) {
            summary += `- *${cat.replace(/_/g, ' ')}*: ${SYSTEMIC_INSIGHTS[cat]}\n`
        }
        summary += '\n'
    }

    return summary
}

/**
 * Build coaching context to inject into the AI review prompt.
 * This makes the AI tailor its explanations to the developer's skill level and weak areas.
 */
export function buildCoachingPromptContext(profile: DeveloperProfile): string {
    if (profile.totalReviews === 0) {
        return `\nDeveloper: @${profile.githubLogin} (first review — provide detailed educational explanations for all findings).`
    }

    const weakList = Object.entries(profile.weakAreas)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([area, count]) => `${area.replace(/_/g, ' ')} (${count}x)`)
        .join(', ')

    const strongList = Object.entries(profile.strongAreas)
        .filter(([, count]) => count >= 2)
        .map(([area]) => area.replace(/_/g, ' '))
        .join(', ')

    let ctx = `\n\nDEVELOPER COACHING CONTEXT (use this to personalize your review):
- Developer: @${profile.githubLogin}
- Skill level: ${profile.skillLevel}
- Total reviews: ${profile.totalReviews}
- Security score: ${profile.securityScore}/100
- Repeated mistake count: ${profile.repeatedMistakes}`

    if (weakList) {
        ctx += `\n- Known weak areas: ${weakList}`
        ctx += `\n- For issues in these weak areas: add a 2-3 line "Why this matters" educational explanation`
        ctx += `\n- If the developer keeps repeating a mistake, be more firm and emphasize the pattern`
        ctx += `\n- For each issue found in this developer's known weak areas, add one sentence: "Systemic impact: [how this specific mistake propagates to other parts of the system]". Do not use praise language.`
    }
    if (strongList) {
        ctx += `\n- Strong areas (skip detailed explanations): ${strongList}`
    }

    ctx += `\n- Adjust explanation depth: ${profile.skillLevel === 'junior' ? 'detailed with examples' : profile.skillLevel === 'senior' ? 'brief, assume familiarity' : 'moderate detail'}`

    return ctx
}

// ── Team Report ───────────────────────────────────────────────────────

export interface TeamReport {
    orgId: string
    period: string
    totalReviews: number
    totalIssues: number
    commonMistakes: Array<{ type: string; count: number; developers: string[] }>
    developerSummaries: Array<{
        githubLogin: string
        skillLevel: string
        totalReviews: number
        securityScore: number
        topWeakAreas: string[]
        repeatedMistakes: number
        trend: string // 'improving' | 'stable' | 'declining'
    }>
    recommendedTraining: string[]
}

export async function generateTeamReport(orgId: string): Promise<TeamReport> {
    // Fetch all developer profiles for this org
    const profiles = await db.query.developerProfiles.findMany({
        where: eq(developerProfiles.orgId, orgId),
    })

    // Fetch recent learning events (last 30 days)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const recentEvents = await db.query.learningEvents.findMany({
        where: and(
            eq(learningEvents.orgId, orgId),
            gte(learningEvents.createdAt, thirtyDaysAgo),
        ),
    })

    // Aggregate common mistakes across team
    const mistakeMap: Record<string, { count: number; devs: Set<string> }> = {}
    for (const event of recentEvents) {
        if (!mistakeMap[event.mistakeType]) {
            mistakeMap[event.mistakeType] = { count: 0, devs: new Set() }
        }
        mistakeMap[event.mistakeType].count++
        mistakeMap[event.mistakeType].devs.add(event.githubLogin)
    }

    const commonMistakes = Object.entries(mistakeMap)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([type, data]) => ({
            type: type.replace(/_/g, ' '),
            count: data.count,
            developers: Array.from(data.devs),
        }))

    // Build developer summaries
    const developerSummaries = profiles.map(p => {
        const weakAreas = (p.weakAreas as Record<string, number>) || {}
        const topWeakAreas = Object.entries(weakAreas)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([area]) => area.replace(/_/g, ' '))

        // Determine trend based on repeated mistakes ratio
        const totalIssues = p.totalIssuesFound || 0
        const repeats = p.repeatedMistakes || 0
        const repeatRatio = totalIssues > 0 ? repeats / totalIssues : 0
        let trend = 'stable'
        if ((p.totalReviews || 0) >= 5) {
            if (repeatRatio < 0.2) trend = 'improving'
            else if (repeatRatio > 0.5) trend = 'declining'
        }

        return {
            githubLogin: p.githubLogin,
            skillLevel: p.skillLevel || 'mid',
            totalReviews: p.totalReviews || 0,
            securityScore: p.securityScore || 50,
            topWeakAreas,
            repeatedMistakes: repeats,
            trend,
        }
    })

    // Generate training recommendations
    const recommendedTraining: string[] = []
    if (commonMistakes.length > 0) {
        const topMistake = commonMistakes[0]
        if (topMistake.developers.length >= 2) {
            recommendedTraining.push(
                `Team training on "${topMistake.type}" — affects ${topMistake.developers.length} developers`
            )
        }
    }

    const securityWeakDevs = developerSummaries.filter(d => d.securityScore < 40)
    if (securityWeakDevs.length > 0) {
        recommendedTraining.push(
            `Security fundamentals for: ${securityWeakDevs.map(d => '@' + d.githubLogin).join(', ')}`
        )
    }

    const juniors = developerSummaries.filter(d => d.skillLevel === 'junior')
    if (juniors.length > 0) {
        recommendedTraining.push(
            `Code review best practices for: ${juniors.map(d => '@' + d.githubLogin).join(', ')}`
        )
    }

    return {
        orgId,
        period: 'Last 30 days',
        totalReviews: profiles.reduce((sum, p) => sum + (p.totalReviews || 0), 0),
        totalIssues: recentEvents.length,
        commonMistakes,
        developerSummaries,
        recommendedTraining,
    }
}

/**
 * Get a single developer's learning history (recent events).
 */
export async function getDeveloperHistory(orgId: string, githubLogin: string, limit = 50) {
    return db.query.learningEvents.findMany({
        where: and(
            eq(learningEvents.orgId, orgId),
            eq(learningEvents.githubLogin, githubLogin),
        ),
        orderBy: [desc(learningEvents.createdAt)],
        limit,
    })
}

// ── Learning from Human Reviews ──────────────────────────────────────

const PREFERENCE_PATTERNS: Record<string, string[]> = {
    naming: ['name', 'naming', 'rename', 'variable name', 'function name', 'descriptive'],
    patterns: ['pattern', 'design', 'architecture', 'abstraction', 'approach', 'structure'],
    testing: ['test', 'coverage', 'unit test', 'assertion', 'mock', 'spec'],
    style: ['format', 'indent', 'spacing', 'convention', 'consistent', 'lint'],
    error_handling: ['error', 'exception', 'try', 'catch', 'handle', 'graceful'],
}

function categorizePreference(commentBody: string): string | null {
    const lower = commentBody.toLowerCase()
    for (const [category, keywords] of Object.entries(PREFERENCE_PATTERNS)) {
        if (keywords.some(kw => lower.includes(kw))) {
            return category
        }
    }
    return null
}

/**
 * Record positive reinforcement from an approved review.
 */
export async function recordPositiveReinforcement(
    orgId: string, githubLogin: string, repo: string, prNumber: number, reviewBody: string
): Promise<void> {
    const profileId = `${orgId}:${githubLogin}`
    const profile = await getDeveloperProfile(orgId, githubLogin)

    await db.insert(learningEvents).values({
        id: crypto.randomUUID(),
        orgId,
        githubLogin,
        repo,
        prNumber,
        mistakeType: "positive_feedback",
        severity: "info",
        wasRepeated: false,
        filePath: null,
        lineNumber: null,
        description: `Approved with feedback: ${reviewBody.substring(0, 500)}`,
    })

    const newSecurityScore = Math.min(100, profile.securityScore + 1)
    await db.update(developerProfiles)
        .set({ securityScore: newSecurityScore, updatedAt: new Date() })
        .where(eq(developerProfiles.id, profileId))
}

/**
 * Learn reviewer style preferences from their PR review comments.
 */
export async function learnReviewerPreferences(
    orgId: string, _repo: string, reviewer: string, comments: any[]
): Promise<void> {
    for (const comment of comments) {
        const body = comment.body || ""
        if (body.length < 20) continue

        const category = categorizePreference(body)
        if (!category) continue

        const prefId = `${orgId}:${category}`
        const existing = await db.query.reviewerPreferences.findFirst({
            where: eq(reviewerPreferences.id, prefId),
        })

        if (existing) {
            // Keep max 5 examples to prevent unbounded growth
            const existingExamples = (existing.preference || "").split("\n---\n")
            const newExample = `@${reviewer}: ${body.substring(0, 300)}`
            const examples = [...existingExamples.slice(-4), newExample]

            await db.update(reviewerPreferences)
                .set({
                    examplesCount: (existing.examplesCount || 1) + 1,
                    preference: examples.join("\n---\n"),
                    lastSeenAt: new Date(),
                    updatedAt: new Date(),
                })
                .where(eq(reviewerPreferences.id, prefId))
        } else {
            await db.insert(reviewerPreferences).values({
                id: prefId,
                orgId,
                category,
                preference: `@${reviewer}: ${body.substring(0, 300)}`,
                source: "human_review",
                examplesCount: 1,
            })
        }
    }
}

/**
 * Coaching context enhanced with team-level reviewer preferences.
 */
export async function buildCoachingPromptContextWithPreferences(
    profile: DeveloperProfile, orgId: string
): Promise<string> {
    let ctx = buildCoachingPromptContext(profile)

    const prefs = await db.query.reviewerPreferences.findMany({
        where: eq(reviewerPreferences.orgId, orgId),
    })

    const strongPrefs = prefs.filter(p => (p.examplesCount || 0) >= 2)
    if (strongPrefs.length > 0) {
        ctx += `\n\nTEAM REVIEW PREFERENCES (learned from human reviewers — enforce these conventions in your review):`
        for (const pref of strongPrefs) {
            const firstExample = (pref.preference || "").split("\n---\n")[0]
            ctx += `\n- ${pref.category}: ${firstExample}`
        }
        ctx += `\n- If any changed code violates a team preference above, flag it as severity "warning" with the specific preference cited.`
    }

    return ctx
}
