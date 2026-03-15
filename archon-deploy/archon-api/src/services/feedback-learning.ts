/**
 * Feedback Learning Service (Feature 2.1 — CodeRabbit-Inspired)
 *
 * Tracks developer reactions to Archon's review comments (thumbs up/down,
 * corrections via replies). Stores learnings and injects relevant ones
 * into future review prompts so Archon improves over time.
 */
import { db } from "../db/client.js"
import { reviewLearnings } from "../db/schema.js"
import { eq, and, desc } from "drizzle-orm"

// ── Types ────────────────────────────────────────────────────────────

export interface FeedbackInput {
    orgId: string
    repo: string
    feedbackType: 'positive' | 'negative' | 'correction'
    originalComment: string
    userFeedback?: string
    filePath?: string
    language?: string
}

// ── Classify Feedback from Reply Text ───────────────────────────────

const NEGATIVE_KEYWORDS = [
    'wrong', 'incorrect', 'not applicable', 'ignore', 'false positive',
    'not a bug', 'intentional', 'by design', 'nit', 'disagree',
    'not relevant', 'this is fine', "doesn't apply",
]

const POSITIVE_KEYWORDS = [
    'good catch', 'thanks', 'fixed', 'great point', 'agreed',
    'will fix', 'nice find', 'updating now',
]

export function classifyFeedback(replyText: string): 'positive' | 'negative' | 'correction' {
    const lower = replyText.toLowerCase().trim()

    for (const keyword of NEGATIVE_KEYWORDS) {
        if (lower.startsWith(keyword) || lower.includes(keyword)) return 'negative'
    }

    for (const keyword of POSITIVE_KEYWORDS) {
        if (lower.includes(keyword)) return 'positive'
    }

    // If the reply provides alternative code or detailed explanation, it's a correction
    if (replyText.includes('```') || replyText.length > 100) return 'correction'

    return 'correction' // Default: ambiguous replies treated as corrections, not praise
}

// ── Infer Category from Comment ─────────────────────────────────────

function inferCategory(comment: string): string {
    const lower = comment.toLowerCase()
    if (/security|injection|xss|csrf|auth|token|secret/.test(lower)) return 'security'
    if (/performance|slow|cache|optimize|memory|leak/.test(lower)) return 'performance'
    if (/error|exception|catch|handle|null|undefined/.test(lower)) return 'error_handling'
    if (/test|coverage|assert|mock|spec/.test(lower)) return 'testing'
    if (/name|naming|convention|style|format/.test(lower)) return 'style'
    if (/type|interface|generic|typing/.test(lower)) return 'typing'
    return 'bug'
}

// ── Infer File Pattern ──────────────────────────────────────────────

function inferFilePattern(filePath: string): string {
    if (!filePath) return '*'
    const parts = filePath.split('/')
    if (parts.length <= 1) return '*'
    // e.g., "src/routes/webhook.ts" → "src/routes/*"
    const dir = parts.slice(0, -1).join('/')
    return `${dir}/*`
}

// ── Store Learning ──────────────────────────────────────────────────

export async function storeLearning(input: FeedbackInput): Promise<void> {
    const category = inferCategory(input.originalComment)
    const filePattern = input.filePath ? inferFilePattern(input.filePath) : '*'

    await db.insert(reviewLearnings).values({
        id: crypto.randomUUID(),
        orgId: input.orgId,
        repo: input.repo,
        feedbackType: input.feedbackType,
        originalComment: input.originalComment.substring(0, 2000),
        userFeedback: input.userFeedback?.substring(0, 2000),
        filePattern,
        language: input.language || null,
        category,
        isActive: true,
    })

    console.log(`Stored ${input.feedbackType} learning for ${input.repo} (category: ${category}, pattern: ${filePattern})`)
}

// ── Process GitHub Reaction ─────────────────────────────────────────

export async function processReaction(
    orgId: string, repo: string,
    reaction: string, // "+1", "-1", "confused", "heart", etc.
    commentBody: string, filePath?: string
): Promise<void> {
    if (reaction === '+1' || reaction === 'heart') {
        await storeLearning({
            orgId, repo,
            feedbackType: 'positive',
            originalComment: commentBody,
            filePath,
        })
    } else if (reaction === '-1' || reaction === 'confused') {
        await storeLearning({
            orgId, repo,
            feedbackType: 'negative',
            originalComment: commentBody,
            filePath,
        })
    }
}

// ── Process Reply to Archon Comment ─────────────────────────────────

export async function processReply(
    orgId: string, repo: string,
    originalComment: string, replyText: string, filePath?: string
): Promise<void> {
    const feedbackType = classifyFeedback(replyText)

    await storeLearning({
        orgId, repo,
        feedbackType,
        originalComment,
        userFeedback: replyText,
        filePath,
    })
}

// ── Load Relevant Learnings for Review Prompt ───────────────────────

export async function loadRelevantLearnings(
    orgId: string, repo: string, changedFiles: string[]
): Promise<string> {
    // Fetch all active learnings for this repo
    const learnings = await db.query.reviewLearnings.findMany({
        where: and(
            eq(reviewLearnings.orgId, orgId),
            eq(reviewLearnings.repo, repo),
            eq(reviewLearnings.isActive, true),
        ),
        orderBy: [desc(reviewLearnings.createdAt)],
        limit: 50,
    })

    if (learnings.length === 0) return ''

    // Score each learning by relevance to current PR
    const scored: Array<{ learning: typeof learnings[0]; score: number }> = []

    for (const learning of learnings) {
        let score = 0
        const pattern = learning.filePattern || '*'

        // Match by file pattern
        if (pattern !== '*') {
            const patternDir = pattern.replace('/*', '')
            for (const file of changedFiles) {
                if (file.startsWith(patternDir)) {
                    score += 10
                    break
                }
            }
        }

        // Boost recent learnings
        const ageHours = (Date.now() - new Date(learning.createdAt!).getTime()) / (1000 * 60 * 60)
        if (ageHours < 24) score += 5
        else if (ageHours < 168) score += 3  // 7 days
        else if (ageHours < 720) score += 1  // 30 days

        // Boost corrections (they're the most informative)
        if (learning.feedbackType === 'correction') score += 5
        if (learning.feedbackType === 'negative') score += 3

        if (score > 0) scored.push({ learning, score })
    }

    // Sort by score, take top 10
    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, 10)

    if (top.length === 0) return ''

    // Build prompt context
    let context = '\n\n=== PAST LEARNINGS (respect these from developer feedback) ===\n'

    for (const { learning } of top) {
        if (learning.feedbackType === 'negative') {
            context += `- DO NOT flag: "${learning.originalComment?.substring(0, 150)}" `
            context += `(developer marked as false positive in ${learning.filePattern || 'files'})\n`
        } else if (learning.feedbackType === 'correction') {
            context += `- CORRECTION: "${learning.originalComment?.substring(0, 100)}" → `
            context += `Developer said: "${learning.userFeedback?.substring(0, 150)}"\n`
        } else if (learning.feedbackType === 'positive') {
            context += `- GOOD pattern: "${learning.originalComment?.substring(0, 150)}" `
            context += `(confirmed useful by developer)\n`
        }
    }

    return context
}
