/**
 * Review Pipeline Service (Features 1.4, 2.2, 2.4, 4.2, 4.3)
 *
 * 1.4 — Path-Scoped Instructions: inject file-pattern-specific review rules
 * 2.2 — Review Self-Check: second AI pass to filter false positives
 * 2.4 — Progressive Deepening: triage → review → cross-cutting check
 * 4.2 — Validation Loop: verify generated fixes before committing
 * 4.3 — Similar Code Search: find similar patterns that may need the same fix
 */
import { Octokit } from "@octokit/rest"
import type { RepoMap } from "./repo-map.js"
import { callAI } from "./review-engine.js"

// ══════════════════════════════════════════════════════════════════════
// Feature 1.4: Path-Scoped Instructions
// ══════════════════════════════════════════════════════════════════════

interface PathInstruction {
    path: string         // glob pattern
    instructions: string // review instructions for matching files
}

/**
 * Load path-scoped review instructions from .archon/rules.yml
 */
export async function loadPathInstructions(
    octokit: Octokit, owner: string, repo: string
): Promise<PathInstruction[]> {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner, repo, path: '.archon/rules.yml',
        })
        if (!('content' in data) || !data.content) return []

        const content = Buffer.from(data.content, 'base64').toString('utf-8')
        return parsePathInstructions(content)
    } catch {
        return []
    }
}

/**
 * Parse review_instructions from YAML (simple parser, no yaml dependency).
 */
function parsePathInstructions(yamlContent: string): PathInstruction[] {
    const instructions: PathInstruction[] = []
    const lines = yamlContent.split('\n')
    let inReviewInstructions = false
    let currentPath = ''
    let currentInstructions = ''

    for (const line of lines) {
        if (line.trim() === 'review_instructions:') {
            inReviewInstructions = true
            continue
        }

        if (!inReviewInstructions) continue

        // New section detected — stop parsing review_instructions
        if (/^\w+:/.test(line) && !line.trim().startsWith('-') && !line.trim().startsWith('path:') && !line.trim().startsWith('instructions:')) {
            if (currentPath && currentInstructions) {
                instructions.push({ path: currentPath, instructions: currentInstructions.trim() })
            }
            break
        }

        const pathMatch = line.match(/^\s+-\s+path:\s*["']?([^"'\n]+)["']?/)
        if (pathMatch) {
            if (currentPath && currentInstructions) {
                instructions.push({ path: currentPath, instructions: currentInstructions.trim() })
            }
            currentPath = pathMatch[1].trim()
            currentInstructions = ''
            continue
        }

        const instrMatch = line.match(/^\s+instructions:\s*\|?\s*$/)
        if (instrMatch) continue

        // Continuation of instructions block
        if (currentPath && line.match(/^\s{6,}/)) {
            currentInstructions += line.trim() + '\n'
        }
    }

    // Push the last one
    if (currentPath && currentInstructions) {
        instructions.push({ path: currentPath, instructions: currentInstructions.trim() })
    }

    return instructions
}

/**
 * Match changed files against path instructions and build prompt context.
 */
export function buildPathInstructionsContext(
    instructions: PathInstruction[],
    changedFiles: string[]
): string {
    if (instructions.length === 0) return ''

    const matched: Array<{ pattern: string; instructions: string }> = []

    for (const inst of instructions) {
        const pattern = inst.path
        for (const file of changedFiles) {
            if (matchGlob(pattern, file)) {
                matched.push({ pattern, instructions: inst.instructions })
                break
            }
        }
    }

    if (matched.length === 0) return ''

    let context = '\n\n=== PATH-SCOPED REVIEW INSTRUCTIONS ===\n'
    for (const m of matched) {
        context += `Files matching "${m.pattern}":\n${m.instructions}\n\n`
    }
    return context
}

/** Simple glob matching (supports **, *) */
function matchGlob(pattern: string, path: string): boolean {
    const regexStr = pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '§§')
        .replace(/\*/g, '[^/]*')
        .replace(/§§/g, '.*')
    return new RegExp(`^${regexStr}$`).test(path)
}

// ══════════════════════════════════════════════════════════════════════
// Feature 2.2: Review Self-Check
// ══════════════════════════════════════════════════════════════════════

const SELF_CHECK_PROMPT = `You are a quality assurance reviewer for AI-generated code review comments.

Given a list of review comments, filter out:
1. False positives (the code is actually correct)
2. Nitpicks that add noise without value
3. Duplicate/redundant comments about the same issue
4. Comments that contradict the provided past learnings
5. Suggestions that would break the code

HARD EXCLUSIONS — always remove these regardless of context:
1. Memory safety issues in TypeScript, JavaScript, Python, Go, Rust (these languages are memory-safe)
2. XSS warnings in React/Vue/Angular components — framework escapes by default
3. Any comment on files matching *.test.*, *.spec.*, __tests__/*
4. Log injection/spoofing — not an exploitable vulnerability in typical web apps
5. Regex injection — only relevant when user controls regex pattern directly
6. Missing HTTPS enforcement — not a code issue, infrastructure concern
7. Environment variable usage flagged as insecure — env vars are the correct pattern
8. Client-side permission/auth checks flagged as security issues — server enforces, client displays
9. Suggesting "use HTTPS" on fetch calls that target configurable env var URLs
10. Flagging console.log as a security issue (it's a code quality issue only)

Return the filtered list as JSON:
{
  "kept": [
    { "path": "file.ts", "line": 1, "severity": "warning", "body": "...", "suggested_fix": "..." }
  ],
  "removed": [
    { "index": 0, "reason": "false positive — the null check exists on line 5" }
  ]
}

CRITICAL JSON RULES:
- Do NOT use actual/literal newline characters inside any JSON string value
- Use \\n for newlines in strings
- Always respond with valid JSON only`

/**
 * Run a self-check pass on review comments to filter false positives.
 * Returns the filtered list and the count of removed comments.
 */
export async function selfCheckReview(
    comments: Array<{ path: string; line: number; side: string; severity: string; body: string; suggested_fix?: string }>,
    prTitle: string,
    prDescription: string,
    learningsContext: string,
    provider: string, apiKey: string, model: string
): Promise<{ filtered: typeof comments; removedCount: number }> {
    if (comments.length === 0) return { filtered: comments, removedCount: 0 }
    // Only skip if there is literally 1 comment — not worth an AI call
    if (comments.length === 1) return { filtered: comments, removedCount: 0 }

    const userPrompt = `PR: "${prTitle}"
Description: ${prDescription?.substring(0, 500) || '(none)'}

${learningsContext}

Review comments to check (${comments.length} total):
${JSON.stringify(comments.map((c, i) => ({
        index: i,
        path: c.path,
        line: c.line,
        severity: c.severity,
        // Use 800 chars so detailed comments are not wrongly filtered due to truncation
        body: c.body.substring(0, 800),
    })), null, 2)}`

    try {
        const { text } = await callAI(SELF_CHECK_PROMPT, userPrompt, provider, apiKey, model, 4096)

        // Parse response
        const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

        if (parsed.kept && Array.isArray(parsed.kept)) {
            const removedCount = comments.length - parsed.kept.length
            console.log(`Self-check: kept ${parsed.kept.length}/${comments.length} comments (removed ${removedCount} false positives)`)

            // Merge back original data for kept comments (AI may have modified text)
            const keptPaths = new Set(parsed.kept.map((k: any) => `${k.path}:${k.line}`))
            const filtered = comments.filter(c => keptPaths.has(`${c.path}:${c.line}`))

            return { filtered, removedCount }
        }

        return { filtered: comments, removedCount: 0 }
    } catch (err: any) {
        console.warn(`Self-check failed (non-fatal): ${err.message}`)
        return { filtered: comments, removedCount: 0 }
    }
}

// ══════════════════════════════════════════════════════════════════════
// Feature 2.4: Progressive Deepening (Triage)
// ══════════════════════════════════════════════════════════════════════

export interface TriageResult {
    riskLevel: 'low' | 'medium' | 'high'
    reviewDepth: 'quick' | 'standard' | 'deep'
    focusAreas: string[]
    skipFiles: string[]
    reasoning: string
}

const TRIAGE_PROMPT = `You are a code review triage system. Given a PR summary, quickly assess its risk level and determine the review depth needed.

Return JSON:
{
  "risk_level": "low" | "medium" | "high",
  "review_depth": "quick" | "standard" | "deep",
  "focus_areas": ["area1", "area2"],
  "skip_files": ["file1.ts", "file2.ts"],
  "reasoning": "1-2 sentences explaining the assessment"
}

Rules:
- low risk: docs, config, simple renames, test-only changes → quick review
- medium risk: new features, moderate refactoring → standard review
- high risk: auth/security changes, DB migrations, core logic, API changes → deep review
- skip_files: files that don't need detailed review (generated, config, lock files)
Always respond with valid JSON only.`

/**
 * Quick triage pass to determine review depth.
 */
export async function triageReview(
    prTitle: string,
    changedFiles: Array<{ filename: string; additions: number; deletions: number; status: string }>,
    provider: string, apiKey: string, model: string
): Promise<TriageResult> {
    const summary = `PR: "${prTitle}"\n\nChanged files (${changedFiles.length}):\n` +
        changedFiles.map(f => `- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`).join('\n')

    try {
        const { text } = await callAI(TRIAGE_PROMPT, summary, provider, apiKey, model, 1024)
        const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

        return {
            riskLevel: parsed.risk_level || 'medium',
            reviewDepth: parsed.review_depth || 'standard',
            focusAreas: parsed.focus_areas || [],
            skipFiles: parsed.skip_files || [],
            reasoning: parsed.reasoning || '',
        }
    } catch {
        // Default to standard if triage fails
        return {
            riskLevel: 'medium',
            reviewDepth: 'standard',
            focusAreas: [],
            skipFiles: [],
            reasoning: 'Triage failed, defaulting to standard review',
        }
    }
}

// ══════════════════════════════════════════════════════════════════════
// Feature 4.2: Validation Loop for Auto-Fix
// ══════════════════════════════════════════════════════════════════════

const VALIDATION_PROMPT = `You are a code validator. Review the generated code for:
1. Syntax errors
2. Missing imports
3. Type mismatches
4. Unresolved references
5. Logic errors

Return JSON:
{
  "valid": true | false,
  "issues": ["issue1", "issue2"],
  "fixed_files": [
    { "path": "file.ts", "content": "corrected content with \\n for newlines" }
  ]
}

If the code is valid, return { "valid": true, "issues": [], "fixed_files": [] }.
If invalid, fix the issues and return the corrected files in fixed_files.

CRITICAL JSON RULES:
- Use \\n for newlines in content strings
- Always respond with valid JSON only`

/**
 * Validate generated code before committing.
 * Returns corrected files if issues are found (max 2 retries).
 */
export async function validateGeneratedCode(
    files: Array<{ path: string; content: string; action: string }>,
    provider: string, apiKey: string, model: string,
    maxRetries = 2
): Promise<{ valid: boolean; files: typeof files; issues: string[] }> {
    let currentFiles = files
    let allIssues: string[] = []

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const prompt = `Validate this generated code:\n\n` +
            currentFiles.map(f => `=== ${f.path} (${f.action}) ===\n${f.content.substring(0, 10000)}\n`).join('\n')

        try {
            const { text } = await callAI(VALIDATION_PROMPT, prompt, provider, apiKey, model, 4096)
            const parsed = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim())

            if (parsed.valid) {
                console.log(`Validation passed on attempt ${attempt + 1}`)
                return { valid: true, files: currentFiles, issues: [] }
            }

            allIssues = parsed.issues || []
            console.log(`Validation attempt ${attempt + 1}: ${allIssues.length} issues found`)

            // Apply fixes if provided
            if (parsed.fixed_files && parsed.fixed_files.length > 0) {
                const fixMap = new Map(parsed.fixed_files.map((f: any) => [f.path, f.content]))
                currentFiles = currentFiles.map(f => ({
                    ...f,
                    content: (fixMap.get(f.path) as string) || f.content,
                }))
            } else {
                break // No fixes provided, stop retrying
            }
        } catch {
            break // Parse error, stop retrying
        }
    }

    return { valid: false, files: currentFiles, issues: allIssues }
}

// ══════════════════════════════════════════════════════════════════════
// Feature 4.3: Similar Code Search
// ══════════════════════════════════════════════════════════════════════

export interface SimilarCodeMatch {
    file: string
    line: number
    pattern: string
}

/**
 * Search the repo map for code patterns similar to what was changed in the PR.
 */
export function findSimilarPatterns(
    changedFiles: Array<{ filename: string; patch: string }>,
    repoMap: RepoMap | null
): string {
    if (!repoMap || repoMap.files.length === 0) return ''

    const matches: string[] = []

    for (const file of changedFiles) {
        if (!file.patch) continue

        // Extract the "before" patterns from removed lines
        const removedLines = file.patch.split('\n')
            .filter(l => l.startsWith('-') && !l.startsWith('---'))
            .map(l => l.substring(1).trim())
            .filter(l => l.length > 20) // Only meaningful lines

        for (const pattern of removedLines.slice(0, 5)) {
            // Search for similar patterns in other files
            for (const f of repoMap.files) {
                if (f.path === file.filename) continue

                // Check if any signatures contain similar keywords
                const keywords = pattern.match(/\b\w{4,}\b/g) || []
                if (keywords.length < 2) continue

                const matchCount = keywords.filter(kw =>
                    f.signatures.some((sig: string) => sig.includes(kw))
                ).length

                if (matchCount >= 2) {
                    matches.push(`${f.path} — may have similar pattern to changed code in ${file.filename}`)
                }
            }
        }
    }

    if (matches.length === 0) return ''

    const unique = [...new Set(matches)].slice(0, 5)
    let report = '\n\n=== SIMILAR CODE IN OTHER FILES ===\n'
    report += 'These files may need the same changes applied:\n'
    for (const m of unique) {
        report += `ℹ️ ${m}\n`
    }
    return report
}
