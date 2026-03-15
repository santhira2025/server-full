/**
 * Archon Chat — PR Q&A Mode
 *
 * Lets developers ask questions directly in PR comments:
 *   /archon explain this function
 *   /archon why is line 42 a security issue?
 *   /archon what does this PR do?
 *   /archon how should I fix the auth bug?
 *   /archon is this approach good for performance?
 *
 * Context-aware: reads PR diff, project memory, and any inline Archon comments
 * already posted on the PR so answers are grounded in the actual code.
 */
import { Octokit } from "@octokit/rest"
import { callAI } from "./review-engine.js"
import { loadProjectMemory } from "./project-memory.js"

// ── Chat System Prompt ────────────────────────────────────────────────

const CHAT_SYSTEM_PROMPT = `You are Archon, an expert AI code reviewer embedded in GitHub. A developer is asking you a question about a pull request or the code in it.

You have access to:
- The PR title and description
- The full diff of changed files
- Past Archon review comments already posted on this PR (if any)
- Project memory (architecture, conventions, known weak areas)

YOUR ROLE:
Answer the developer's question clearly, accurately, and concisely. You are a senior engineer pair-programming with them — not a generic assistant.

RULES:
1. Answer the specific question asked. Don't give a generic code review.
2. Reference specific files/lines from the diff when relevant (use \`file.ts:42\` format).
3. If the question is about a security issue found by Archon, explain the attack vector in plain English with a concrete example.
4. If the question is about how to fix something, provide a specific code fix where possible (use code blocks).
5. If the answer requires context you don't have (e.g., runtime behavior), say so clearly.
6. Keep answers focused — ideally 3–10 sentences. If a longer answer is truly needed, use headers/bullets.
7. Never repeat back the question or say "Great question!".
8. Respond in Markdown. Start directly with your answer — no preamble.`

// ── Chat Response Formatter ───────────────────────────────────────────

function formatChatResponse(answer: string, question: string): string {
    return `**Archon:** ${answer}\n\n---\n*Asked: "${question.substring(0, 120)}${question.length > 120 ? '...' : ''}"*`
}

// ── Context Builder ───────────────────────────────────────────────────

async function buildChatContext(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    question: string,
    projectMemory: string
): Promise<string> {
    // 1. Fetch PR details
    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })

    // 2. Fetch diff (limited to relevant files based on question keywords)
    let diffContext = ""
    try {
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: prNumber, per_page: 50,
        })

        // Score files by relevance to the question keywords
        const questionLower = question.toLowerCase()
        const keywords = questionLower.match(/\b\w{4,}\b/g) || []

        const scoredFiles = files.map(f => {
            let score = 0
            const pathLower = f.filename.toLowerCase()
            keywords.forEach(kw => {
                if (pathLower.includes(kw)) score += 10
                if (f.patch?.toLowerCase().includes(kw)) score += 2
            })
            return { file: f, score }
        })

        // Sort by relevance, take top 8 files
        scoredFiles.sort((a, b) => b.score - a.score)
        const topFiles = scoredFiles.slice(0, 8)

        diffContext = topFiles
            .filter(sf => sf.file.patch)
            .map(sf => {
                const f = sf.file
                return `### ${f.filename} (+${f.additions} -${f.deletions})\n\`\`\`diff\n${f.patch?.substring(0, 3000)}\n\`\`\``
            })
            .join("\n\n")
    } catch {
        diffContext = "(could not fetch PR diff)"
    }

    // 3. Fetch recent Archon comments on this PR (provides review context)
    let archonComments = ""
    try {
        const { data: comments } = await octokit.rest.issues.listComments({
            owner, repo, issue_number: prNumber, per_page: 30,
        })
        const botComments = comments
            .filter(c => c.user?.type === "Bot" || c.user?.login?.includes("archon"))
            .map(c => c.body?.substring(0, 1500) || "")
            .filter(Boolean)
            .slice(0, 3)
        if (botComments.length > 0) {
            archonComments = `\n\n### Previous Archon Review Comments\n${botComments.join("\n\n---\n\n")}`
        }
    } catch { /* non-fatal */ }

    // 4. Build the full context
    let ctx = `## PR #${prNumber}: ${pr.title}\n\n`
    ctx += `**Description:** ${pr.body?.substring(0, 800) || "(no description)"}\n\n`
    ctx += `**Author:** @${pr.user?.login} | **Base:** \`${pr.base?.ref}\` → \`${pr.head?.ref}\`\n\n`

    if (projectMemory) {
        ctx += `## Project Context\n${projectMemory.substring(0, 8000)}\n\n`
    }

    ctx += `## Changed Files (Diff)\n\n${diffContext}`
    ctx += archonComments

    ctx += `\n\n---\n\n## Developer Question\n${question}`

    return ctx
}

// ── Main Chat Handler ─────────────────────────────────────────────────

export interface ChatResult {
    answer: string
    inputTokens: number
    outputTokens: number
}

export async function runChat(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    question: string,
    provider: string,
    apiKey: string,
    model: string
): Promise<ChatResult> {
    // Load project memory for context
    let projectMemory = ""
    try {
        projectMemory = await loadProjectMemory(octokit, owner, repo)
    } catch { /* non-fatal */ }

    // Build full context
    const userPrompt = await buildChatContext(
        octokit, owner, repo, prNumber, question, projectMemory
    )

    console.log(`Chat: answering "${question.substring(0, 80)}..." for ${owner}/${repo}#${prNumber}`)
    const { text, inputTokens, outputTokens } = await callAI(
        CHAT_SYSTEM_PROMPT,
        userPrompt,
        provider, apiKey, model,
        2048  // Chat answers should be concise
    )

    return {
        answer: text.trim(),
        inputTokens,
        outputTokens,
    }
}

// ── Intent Classifier: is this a chat question or a command? ──────────
// Returns true if the text looks like a natural language question
// that should go to chat mode rather than trigger a standard command.

export function isChatQuestion(text: string): boolean {
    const lower = text.toLowerCase().trim()

    // Explicit questions
    if (/^(what|why|how|when|where|is|are|can|could|should|does|do|will|would|explain|tell me)\b/.test(lower)) return true
    if (/\?$/.test(lower)) return true

    // Phrasing patterns that suggest Q&A rather than commands
    if (/\b(this|that|the|these)\b.{0,30}\b(function|method|class|variable|code|line|issue|bug|error|warning)\b/i.test(lower)) return true
    if (/\b(understand|confused|not sure|wondering|curious|question)\b/i.test(lower)) return true
    if (/\b(mean|means|meaning|means by|stands for)\b/i.test(lower)) return true

    return false
}
