/**
 * Project Memory — persistent per-repo knowledge stored in .archon/memory.md
 *
 * Archon reads the codebase, builds a memory file, and commits it to the repo.
 * Every future review reads this file first so Archon already "knows" the project.
 * Developers can read and edit the file — full transparency, no black box.
 */
import { Octokit } from "@octokit/rest"
import { db } from "../db/client.js"
import { repos } from "../db/schema.js"
import { eq } from "drizzle-orm"

const MEMORY_PATH = ".archon/memory.md"

// ── Types ────────────────────────────────────────────────────────────

interface MemorySections {
    meta: string
    overview: string
    architecture: string
    techStack: string
    conventions: string
    weakAreas: string
    architectureDecisions: string
    criticalFiles: string
    overrides: string
    incidentHistory: string
    lastAnalysis: string
}

interface ReviewLearning {
    prNumber: number
    verdict: string
    inlineComments: Array<{ path: string; body: string; severity: string }>
    securityIssues: Array<{ file: string; description: string; severity: string }>
    filesChanged: string[]
}

// ── Load Memory ──────────────────────────────────────────────────────

export async function loadProjectMemory(
    octokit: Octokit, owner: string, repo: string
): Promise<string> {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner, repo, path: MEMORY_PATH,
        })
        if ("content" in data) {
            return Buffer.from(data.content, "base64").toString("utf-8")
        }
    } catch { /* file doesn't exist yet — that's fine */ }
    return ""
}

// ── Save Memory ──────────────────────────────────────────────────────

export async function saveProjectMemory(
    octokit: Octokit, owner: string, repo: string, content: string
): Promise<void> {
    let sha: string | undefined
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner, repo, path: MEMORY_PATH,
        })
        if ("sha" in data) sha = data.sha
    } catch { /* file doesn't exist yet */ }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo,
        path: MEMORY_PATH,
        message: "chore: update Archon project memory",
        content: Buffer.from(content).toString("base64"),
        sha,
    })

    // Update memory timestamp in repo record
    const repoFullName = `${owner}/${repo}`
    try {
        const repoRecord = await db.query.repos.findFirst({ where: eq(repos.fullName, repoFullName) })
        if (repoRecord) {
            const settings = (repoRecord.settings as any) || {}
            settings.memoryLastUpdated = new Date().toISOString()
            settings.memoryVersion = (settings.memoryVersion || 0) + 1
            await db.update(repos).set({ settings }).where(eq(repos.fullName, repoFullName))
        }
    } catch { /* non-fatal */ }
}

// ── Full Project Analysis (for /archon analyze) ──────────────────────

export async function runFullProjectAnalysis(
    octokit: Octokit, owner: string, repo: string,
    provider: string, apiKey: string, model: string,
    callAI: (system: string, user: string, provider: string, apiKey: string, model: string, maxTokens?: number) => Promise<{ text: string; inputTokens: number; outputTokens: number }>
): Promise<{ memory: string; inputTokens: number; outputTokens: number }> {
    console.log(`Running full project analysis for ${owner}/${repo}...`)

    // 1. Fetch repo file tree
    const tree = await fetchFileTree(octokit, owner, repo)
    console.log(`File tree: ${tree.length} files`)

    // 2. Fetch key files content
    const keyFiles = selectKeyFiles(tree)
    console.log(`Selected ${keyFiles.length} key files for analysis`)

    const fileContents: Array<{ path: string; content: string }> = []
    for (const path of keyFiles) {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path })
            if ("content" in data) {
                const content = Buffer.from(data.content, "base64").toString("utf-8")
                // Limit each file to 500 lines to stay within token budget
                const trimmed = content.split("\n").slice(0, 500).join("\n")
                fileContents.push({ path, content: trimmed })
            }
        } catch { /* skip unreadable files */ }
    }

    // 3. Fetch existing memory (for merge)
    const existingMemory = await loadProjectMemory(octokit, owner, repo)

    // 4. Fetch package.json for tech stack
    let packageJson = ""
    try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: "package.json" })
        if ("content" in data) packageJson = Buffer.from(data.content, "base64").toString("utf-8")
    } catch {}

    // 5. Fetch README for overview
    let readme = ""
    for (const readmePath of ["README.md", "readme.md", "Readme.md"]) {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: readmePath })
            if ("content" in data) {
                readme = Buffer.from(data.content, "base64").toString("utf-8")
                break
            }
        } catch {}
    }

    // 6. Ask AI to build the memory
    const systemPrompt = ANALYZE_SYSTEM_PROMPT
    let userPrompt = `## Repository: ${owner}/${repo}\n\n`
    userPrompt += `### File Tree\n\`\`\`\n${tree.join("\n")}\n\`\`\`\n\n`

    if (packageJson) {
        userPrompt += `### package.json\n\`\`\`json\n${packageJson}\n\`\`\`\n\n`
    }

    if (readme) {
        userPrompt += `### README.md\n${readme.substring(0, 3000)}\n\n`
    }

    for (const f of fileContents) {
        userPrompt += `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\`\n\n`
    }

    if (existingMemory) {
        userPrompt += `### Existing Memory (merge with new findings, preserve Manual Overrides section)\n${existingMemory}\n\n`
    }

    console.log(`Sending ${userPrompt.length} chars to AI for project analysis...`)
    const { text, inputTokens, outputTokens } = await callAI(systemPrompt, userPrompt, provider, apiKey, model, 8192)

    // 7. Build the final memory file
    const now = new Date().toISOString().split("T")[0]
    let memory = `# Archon Project Memory\n`
    memory += `> Last full scan: ${now}\n`
    memory += `> Repository: ${owner}/${repo}\n\n`
    memory += text

    // Ensure Manual Overrides section exists
    if (!memory.includes("## Manual Overrides")) {
        memory += `\n\n## Manual Overrides\n_Add team-specific rules here. Archon will respect these in every review._\n`
        memory += `<!-- Examples:\n`
        memory += `- NEVER flag missing semicolons — we use prettier with no-semi\n`
        memory += `- IGNORE test/ directory for security scans\n`
        memory += `- auth.py is legacy code, flag but don't REQUEST_CHANGES\n`
        memory += `-->\n`
    }

    // 8. Commit to repo
    await saveProjectMemory(octokit, owner, repo, memory)
    console.log(`Project memory saved to ${owner}/${repo}:${MEMORY_PATH}`)

    return { memory, inputTokens, outputTokens }
}

// ── Update Memory After Review ───────────────────────────────────────

export async function updateMemoryWithReview(
    octokit: Octokit, owner: string, repo: string,
    learning: ReviewLearning
): Promise<void> {
    const memory = await loadProjectMemory(octokit, owner, repo)
    if (!memory) return // No memory file yet — skip (they need to run /archon analyze first)

    const sections = parseMemorySections(memory)

    // Update conventions from review patterns — deduplicate with case-insensitive check
    const existingConventionLines = (sections.conventions || '')
        .split('\n')
        .filter(l => l.startsWith('- '))
    const newConventions: string[] = []
    for (const c of learning.inlineComments) {
        if (c.severity === "critical" || c.severity === "warning") {
            const pattern = extractConvention(c.body, c.path)
            if (pattern) {
                const normalized = pattern.toLowerCase()
                const alreadyKnown = existingConventionLines.some(l =>
                    l.toLowerCase().includes(normalized)
                )
                if (!alreadyKnown) newConventions.push(pattern)
            }
        }
    }

    if (newConventions.length > 0) {
        const conventionLines = newConventions.map(c => `- ${c} (learned from PR #${learning.prNumber})`).join("\n")
        if (sections.conventions) {
            sections.conventions = sections.conventions.trimEnd() + "\n" + conventionLines + "\n"
        } else {
            sections.conventions = `## Team Conventions (learned from reviews)\n${conventionLines}\n`
        }
        // Cap conventions at 15 most recent entries
        const allConvLines = sections.conventions.split('\n').filter(l => l.startsWith('- '))
        if (allConvLines.length > 15) {
            sections.conventions = `## Team Conventions (learned from reviews)\n${allConvLines.slice(-15).join('\n')}\n`
        }
    }

    // Update weak areas — deduplicate by category, cap at 25 entries
    if (learning.securityIssues.length > 0) {
        const weakAreaMap: Record<string, { count: number; filePattern: string }> = {}
        for (const s of learning.securityIssues) {
            const category = extractWeakAreaCategory(s.description)
            const filePattern = extractFilePattern(s.file)
            const key = `${category}|||${filePattern}`
            if (!weakAreaMap[key]) weakAreaMap[key] = { count: 0, filePattern }
            weakAreaMap[key].count++
        }

        const issueLines = Object.entries(weakAreaMap).map(([key, data]) => {
            const category = key.split("|||")[0]
            return `- ${category} — ${data.filePattern} — seen ${data.count} time${data.count > 1 ? 's' : ''} (PR #${learning.prNumber})`
        })

        // Only append lines whose category doesn't already exist in the section
        const existingWeakLines = (sections.weakAreas || '').split('\n').filter(l => l.startsWith('- '))
        const toAdd = issueLines.filter(newLine => {
            const newCat = newLine.match(/^- (.+?) —/)?.[1]?.trim().toLowerCase()
            return !existingWeakLines.some(existing => {
                const exCat = existing.match(/^- (.+?) —/)?.[1]?.trim().toLowerCase()
                return exCat && newCat && exCat === newCat
            })
        })

        if (toAdd.length > 0) {
            if (sections.weakAreas) {
                sections.weakAreas = sections.weakAreas.trimEnd() + "\n" + toAdd.join("\n") + "\n"
            } else {
                sections.weakAreas = `## Known Weak Areas\n${toAdd.join("\n")}\n`
            }
        }

        // Cap at 25 most recent items to prevent unbounded growth
        const allWeakLines = sections.weakAreas.split('\n').filter(l => l.startsWith('- '))
        if (allWeakLines.length > 25) {
            sections.weakAreas = `## Known Weak Areas\n${allWeakLines.slice(-25).join('\n')}\n`
        }
    }

    // Update meta (increment review count)
    const reviewCountMatch = sections.meta.match(/Reviews completed: (\d+)/)
    if (reviewCountMatch) {
        const count = parseInt(reviewCountMatch[1]) + 1
        sections.meta = sections.meta.replace(/Reviews completed: \d+/, `Reviews completed: ${count}`)
    }

    // Update last updated date
    const now = new Date().toISOString().split("T")[0]
    if (sections.meta.includes("Last updated:")) {
        sections.meta = sections.meta.replace(/Last updated: .+/, `Last updated: ${now} (after PR #${learning.prNumber})`)
    } else {
        sections.meta = sections.meta.trimEnd() + `\n> Last updated: ${now} (after PR #${learning.prNumber})\n`
    }

    const updated = rebuildMemory(sections)
    await saveProjectMemory(octokit, owner, repo, updated)
    console.log(`Memory updated for ${owner}/${repo} after PR #${learning.prNumber}`)
}

// ── Update Memory on PR Merge ────────────────────────────────────────

export async function updateMemoryOnMerge(
    octokit: Octokit, owner: string, repo: string,
    changedFiles: string[], prNumber: number,
    provider: string, apiKey: string, model: string,
    callAI: (system: string, user: string, provider: string, apiKey: string, model: string, maxTokens?: number) => Promise<{ text: string; inputTokens: number; outputTokens: number }>
): Promise<void> {
    const memory = await loadProjectMemory(octokit, owner, repo)
    if (!memory) return

    // Check if important files changed
    const importantChanges = changedFiles.filter(f =>
        f.includes("package.json") ||
        f.includes("schema") ||
        f.includes("index.ts") || f.includes("index.js") ||
        f.includes("README") ||
        f.endsWith(".env.example") ||
        f.includes("tsconfig") ||
        f.includes("Dockerfile") ||
        f.includes("docker-compose")
    )

    if (importantChanges.length === 0) return

    console.log(`Important files changed in merged PR #${prNumber}: ${importantChanges.join(", ")}`)

    // Fetch the changed files content
    let context = `## Files changed in PR #${prNumber} (just merged to main)\n\n`
    for (const filePath of importantChanges.slice(0, 5)) {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: filePath })
            if ("content" in data) {
                const content = Buffer.from(data.content, "base64").toString("utf-8")
                context += `### ${filePath}\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\`\n\n`
            }
        } catch {}
    }

    // Ask AI to update only the relevant sections
    const { text } = await callAI(
        MERGE_UPDATE_PROMPT,
        `## Current Memory\n${memory}\n\n${context}`,
        provider, apiKey, model, 4096
    )

    // Save updated memory
    const now = new Date().toISOString().split("T")[0]
    let updated = text
    if (!updated.includes("Last updated:")) {
        updated = updated.replace(
            /Last full scan: .+/,
            `Last full scan: $&\n> Last updated: ${now} (PR #${prNumber} merged)`
        )
    }

    await saveProjectMemory(octokit, owner, repo, updated)
    console.log(`Memory updated for ${owner}/${repo} after PR #${prNumber} merged`)
}

// ── Parse Manual Overrides ───────────────────────────────────────────

export function parseOverrides(memory: string): string[] {
    if (!memory) return []
    const overrideSection = memory.match(/## Manual Overrides\n([\s\S]*?)(?=\n## |\n# |$)/)
    if (!overrideSection) return []

    return overrideSection[1]
        .split("\n")
        .filter(line => line.startsWith("- ") && !line.startsWith("<!-- "))
        .map(line => line.substring(2).trim())
        .filter(Boolean)
}

// ── Staleness Check ──────────────────────────────────────────────────

export function getMemoryStaleness(memory: string): { daysSince: number; isStale: boolean; lastScan: string } {
    const match = memory.match(/Last full scan: (\d{4}-\d{2}-\d{2})/)
    if (!match) return { daysSince: 999, isStale: true, lastScan: "never" }

    const lastScan = match[1]
    const daysSince = Math.floor((Date.now() - new Date(lastScan).getTime()) / (1000 * 60 * 60 * 24))
    return { daysSince, isStale: daysSince > 7, lastScan }
}

// ── Memory Hierarchy for Monorepos (Feature 2.3) ────────────────────

/**
 * Load memory hierarchy: root .archon/memory.md + directory-scoped memories.
 * For monorepos, subdirectories like packages/api/.archon/memory.md override
 * the root memory for files within that directory.
 */
export async function loadMemoryHierarchy(
    octokit: Octokit, owner: string, repo: string,
    changedFiles: string[]
): Promise<string> {
    // Always load root memory
    const rootMemory = await loadProjectMemory(octokit, owner, repo)

    // Find unique parent directories of changed files that might have scoped memory
    const dirs = new Set<string>()
    for (const file of changedFiles) {
        const parts = file.split('/')
        // Check each parent directory level
        for (let i = 1; i < parts.length; i++) {
            dirs.add(parts.slice(0, i).join('/'))
        }
    }

    // Try loading scoped memory files (closest directory wins)
    const scopedMemories: Array<{ dir: string; content: string; depth: number }> = []

    for (const dir of dirs) {
        const memPath = `${dir}/.archon/memory.md`
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path: memPath,
            })
            if ('content' in data && data.content) {
                const content = Buffer.from(data.content, 'base64').toString('utf-8')
                scopedMemories.push({
                    dir,
                    content,
                    depth: dir.split('/').length,
                })
            }
        } catch { /* no scoped memory at this level */ }
    }

    if (scopedMemories.length === 0) return rootMemory

    // Sort by depth (deepest first = most specific)
    scopedMemories.sort((a, b) => b.depth - a.depth)

    // Merge: root memory + most specific scoped memories
    let merged = rootMemory
    const added = new Set<string>()

    for (const scoped of scopedMemories.slice(0, 3)) {
        if (added.has(scoped.dir)) continue
        added.add(scoped.dir)
        merged += `\n\n=== SCOPED MEMORY (${scoped.dir}/) ===\n${scoped.content}`
    }

    return merged
}

// ── Build Prompt Context from Memory ─────────────────────────────────

export function buildMemoryPromptContext(memory: string): string {
    if (!memory) return ""

    const overrides = parseOverrides(memory)
    const staleness = getMemoryStaleness(memory)

    let context = `\n\n## Project Context (from .archon/memory.md)\n${memory}\n`

    if (overrides.length > 0) {
        context += `\nHARD RULES FROM TEAM (you MUST follow these):\n`
        context += overrides.map(o => `- ${o}`).join("\n")
        context += "\n"
    }

    if (staleness.isStale) {
        context += `\nNOTE: Project memory is ${staleness.daysSince} days old. Some information may be outdated.\n`
    }

    return context
}

// ── Internal Helpers ─────────────────────────────────────────────────

async function fetchFileTree(octokit: Octokit, owner: string, repo: string): Promise<string[]> {
    try {
        const { data } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: "HEAD", recursive: "1",
        })
        return data.tree
            .filter(t => t.type === "blob")
            .map(t => t.path!)
            .filter(p => !p.includes("node_modules/") && !p.includes(".git/") && !p.includes("dist/") && !p.includes("build/") && !p.startsWith("."))
            .slice(0, 500) // cap for large repos
    } catch {
        return []
    }
}

function selectKeyFiles(tree: string[]): string[] {
    const priority: string[] = []
    const patterns = [
        /package\.json$/,
        /tsconfig\.json$/,
        /^src\/index\.[tj]sx?$/,
        /^src\/app\.[tj]sx?$/,
        /^src\/main\.[tj]sx?$/,
        /schema\.[tj]s$/,
        /routes?\//,
        /services?\//,
        /\.env\.example$/,
        /Dockerfile$/,
        /docker-compose/,
        /README\.md$/i,
        /drizzle\.config/,
        /vite\.config/,
        /next\.config/,
    ]

    for (const file of tree) {
        for (const pattern of patterns) {
            if (pattern.test(file) && !priority.includes(file)) {
                priority.push(file)
            }
        }
    }

    // Also add entry files from src/ root
    for (const file of tree) {
        if (file.match(/^src\/[^/]+\.[tj]sx?$/) && !priority.includes(file)) {
            priority.push(file)
        }
    }

    return priority.slice(0, 20) // max 20 files
}

function extractConvention(commentBody: string, filePath?: string): string | null {
    const lower = commentBody.toLowerCase()
    const fileHint = filePath ? ` in ${extractFilePattern(filePath)}` : ""
    if (lower.includes("use parameterized") || lower.includes("sql injection")) return `Use parameterized queries, not string concatenation for SQL${fileHint}`
    if (lower.includes("hardcoded secret") || lower.includes("environment variable")) return `No hardcoded secrets — use environment variables${fileHint}`
    if (lower.includes("async/await") && lower.includes("callback")) return `Use async/await, not callbacks${fileHint}`
    if (lower.includes("try/catch") || lower.includes("error handling")) return `Every async function needs proper error handling${fileHint}`
    if (lower.includes("console.log") && lower.includes("production")) return `No console.log in production code${fileHint}`
    if (lower.includes("input validation") || lower.includes("sanitiz")) return `Validate and sanitize all user input${fileHint}`
    if (lower.includes("type assertion") || lower.includes("as any")) return `Avoid \`as any\` type assertions — use proper types${fileHint}`
    return null
}

function extractWeakAreaCategory(description: string): string {
    const lower = description.toLowerCase()
    if (lower.includes("sql injection") || lower.includes("parameterized")) return "SQL injection risk"
    if (lower.includes("xss") || lower.includes("cross-site")) return "XSS vulnerability"
    if (lower.includes("hardcoded") || lower.includes("secret") || lower.includes("credential")) return "Hardcoded secrets"
    if (lower.includes("command injection") || lower.includes("exec(")) return "Command injection risk"
    if (lower.includes("path traversal") || lower.includes("directory traversal")) return "Path traversal risk"
    if (lower.includes("auth") || lower.includes("bypass")) return "Authentication bypass risk"
    if (lower.includes("csrf")) return "CSRF vulnerability"
    if (lower.includes("insecure") && lower.includes("crypt")) return "Insecure cryptography"
    if (lower.includes("injection")) return "Injection risk"
    // Fall back to first 40 chars of description as category
    return description.substring(0, 40).replace(/[^\w\s-]/g, "").trim()
}

function extractFilePattern(filePath: string): string {
    if (!filePath) return "unknown"
    // Replace specific filename with wildcard for pattern generalization
    const parts = filePath.split("/")
    if (parts.length <= 1) return filePath
    // Keep directory structure, replace filename with wildcard-ish label
    const dir = parts.slice(0, -1).join("/")
    const ext = parts[parts.length - 1].match(/\.[^.]+$/)?.[0] || ""
    return `${dir}/*${ext}`
}

function parseMemorySections(memory: string): MemorySections {
    const sections: MemorySections = {
        meta: "", overview: "", architecture: "", techStack: "",
        conventions: "", weakAreas: "", architectureDecisions: "",
        criticalFiles: "", overrides: "", incidentHistory: "", lastAnalysis: "",
    }

    // Extract meta (everything before first ## section)
    const metaMatch = memory.match(/^([\s\S]*?)(?=\n## )/)
    if (metaMatch) sections.meta = metaMatch[1]

    // Extract named sections
    const sectionMap: Record<string, keyof MemorySections> = {
        "Project Overview": "overview",
        "Architecture": "architecture",
        "Tech Stack": "techStack",
        "Team Conventions": "conventions",
        "Known Weak Areas": "weakAreas",
        "Architecture Decisions": "architectureDecisions",
        "Files to Always Check": "criticalFiles",
        "Critical Files": "criticalFiles",
        "Manual Overrides": "overrides",
        "Incident History": "incidentHistory",
        "Last Analysis": "lastAnalysis",
    }

    for (const [heading, key] of Object.entries(sectionMap)) {
        const regex = new RegExp(`## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`)
        const match = memory.match(regex)
        if (match) {
            sections[key] = `## ${heading}\n${match[1]}`
        }
    }

    return sections
}

function rebuildMemory(sections: MemorySections): string {
    const parts = [sections.meta]

    if (sections.overview) parts.push(sections.overview)
    if (sections.architecture) parts.push(sections.architecture)
    if (sections.techStack) parts.push(sections.techStack)
    if (sections.conventions) parts.push(sections.conventions)
    if (sections.weakAreas) parts.push(sections.weakAreas)
    if (sections.architectureDecisions) parts.push(sections.architectureDecisions)
    if (sections.criticalFiles) parts.push(sections.criticalFiles)
    if (sections.incidentHistory) parts.push(sections.incidentHistory)
    if (sections.lastAnalysis) parts.push(sections.lastAnalysis)
    if (sections.overrides) parts.push(sections.overrides)

    return parts.filter(Boolean).join("\n\n").trimEnd() + "\n"
}

// ── AI Prompts ───────────────────────────────────────────────────────

const ANALYZE_SYSTEM_PROMPT = `You are Archon, an AI code reviewer that builds project memory files.

Given a repository's file tree, key files, and optionally a README and package.json, create a comprehensive project memory in Markdown format.

Your output should contain ONLY these sections (use ## headings):

## Project Overview
Brief 2-3 sentence description of what this project does, its purpose, and tech stack.

## Architecture
Map of major directories and their purpose. Entry points. How components connect.

## Tech Stack
Languages, frameworks, databases, tools. List with versions where available.

## Team Conventions (learned from reviews)
SCHEMA: Specific actionable patterns only. Each entry must use the format: "Do X, not Y"
Examples: "Use Drizzle ORM for all DB queries, never raw SQL strings" | "Use async/await, not .then() chains" | "Always validate user input at the route handler, not inside the service"
Start empty if no prior reviews — this section grows over time.

## Known Weak Areas
SCHEMA: Each entry must use the format: "[category] — [specific file pattern] — seen N times"
Examples: "Missing error handling — src/routes/*.ts — seen 3 times" | "SQL injection risk — src/services/db*.ts — seen 1 time"
Start empty if no prior reviews.

## Architecture Decisions
SCHEMA: Each entry must use the format: "[decision] — [rationale] — [implication for reviewers]"
Examples: "Use Drizzle ORM — type-safe queries, no raw SQL — reviewers: flag any db.execute() with string interpolation" | "JWT in Authorization header — stateless auth — reviewers: verify middleware is applied before each protected route"

## Files to Always Check
SCHEMA: Each entry must use the format: "[path] — [what to check]"
Examples: "src/routes/auth.ts — verify JWT validation middleware before every route handler" | "src/db/schema.ts — check for missing indexes on foreign keys"

## Manual Overrides
_This section is edited by the team. Preserve any existing content._

Rules:
- Be concise — each section should be 3-10 bullet points max
- Follow the SCHEMA format for each section — generic summaries are not useful
- Focus on what a reviewer needs to know, not documentation
- If existing memory is provided, MERGE new findings — don't lose previous learnings
- ALWAYS preserve the Manual Overrides section content exactly as-is
- Output raw Markdown only, no code fences around the whole response`

const MERGE_UPDATE_PROMPT = `You are Archon, updating a project memory file after important files changed.

Given the current memory and the changed files, update ONLY the sections affected by the changes:
- package.json changed → update Tech Stack
- schema files changed → update Architecture
- index/entry files changed → update Architecture
- README changed → update Project Overview
- Config files changed → update Tech Stack or Architecture Decisions

SECTION SCHEMAS — use these formats when writing or updating sections:

## Team Conventions
Format each entry as: "Do X, not Y"
Example: "Use Drizzle ORM for all DB queries, never raw SQL strings"

## Known Weak Areas
Format each entry as: "[category] — [specific file pattern] — seen N times"
Example: "Missing error handling — src/routes/*.ts — seen 3 times"

## Architecture Decisions
Format each entry as: "[decision] — [rationale] — [implication for reviewers]"
Example: "Use Drizzle ORM — type-safe queries — reviewers: flag any raw db.execute() with string interpolation"

## Files to Always Check
Format each entry as: "[path] — [what to check]"
Example: "src/routes/auth.ts — verify JWT validation middleware before every route handler"

Rules:
- Output the COMPLETE updated memory file (all sections)
- PRESERVE all sections that didn't change
- PRESERVE the Manual Overrides section exactly as-is
- Update the "Last updated" line in the header
- Be concise — don't add unnecessary detail
- Output raw Markdown only`
