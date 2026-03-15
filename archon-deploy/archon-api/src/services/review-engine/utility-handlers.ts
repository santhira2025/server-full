/**
 * Utility handler functions extracted from review-engine.ts.
 * Contains: runExplain, generatePRSummary, generateFullDiagram,
 *           runIssueAnalysis, runIntentValidation, runAICodeAudit,
 *           runTestGeneration, runDocsGeneration
 */
import { Octokit } from "@octokit/rest"
import type { PRContext, ReviewResult, InlineComment, SecurityIssue, IntentAnalysis, AIPatternAnalysis } from "./types.js"
import { callAI, truncatePrompt } from "./ai-client.js"
import { parseJSON } from "./json-utils.js"
import { EXPLAIN_PROMPT, SUMMARY_PROMPT, DIAGRAM_PROMPT, INTENT_PROMPT, AI_AUDIT_PROMPT, TEST_GENERATION_PROMPT, DOCS_SYSTEM_PROMPT } from "./prompts.js"
import { selectSecurityKeyFiles } from "./file-selection.js"
import { createBranch, commitFile } from "./github-ops.js"
import { loadProjectMemory } from "../project-memory.js"
import { validateGeneratedCode } from "../review-pipeline.js"

// ── Explain ───────────────────────────────────────────────────────────

export async function runExplain(
    ctx: PRContext, provider: string, apiKey: string, model: string
): Promise<ReviewResult> {
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n`
    for (const f of ctx.filesChanged) {
        prompt += `#### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\`\n\n`
    }

    const { text, inputTokens, outputTokens } = await callAI(EXPLAIN_PROMPT, prompt, provider, apiKey, model, 4096)
    return {
        summary: text,
        verdict: 'COMMENT',
        inlineComments: [],
        securityIssues: [],
        filesReviewed: ctx.filesChanged.length,
        inputTokens,
        outputTokens,
    }
}

// ── PR Summary ────────────────────────────────────────────────────────

export async function generatePRSummary(
    octokit: Octokit, owner: string, repo: string, issueNumber: number,
    ctx: PRContext, provider: string, apiKey: string, model: string,
    coachingContext?: string, devProfile?: any,
): Promise<{ inputTokens: number; outputTokens: number }> {
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n`
    prompt += `**Author:** ${ctx.author} | **Branch:** ${ctx.headBranch} -> ${ctx.baseBranch}\n\n`
    if (ctx.body) prompt += `### Description\n${ctx.body}\n\n`

    prompt += `### Files Changed (${ctx.filesChanged.length})\n\n`
    for (const f of ctx.filesChanged) {
        prompt += `- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`
        if (f.patch && f.patch.length < 5000) {
            prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n`
        }
    }

    if (prompt.length > 100000) {
        prompt = truncatePrompt(prompt, 100000, 'pr-summary')
    }

    const systemPrompt = SUMMARY_PROMPT + (coachingContext || '')
    const { text, inputTokens, outputTokens } = await callAI(systemPrompt, prompt, provider, apiKey, model, 4096)
    const parsed = parseJSON(text)

    // Build markdown output
    let markdown = `## Archon PR Summary\n\n`
    markdown += parsed.paragraph_summary || 'No summary generated.'
    markdown += '\n\n'

    // Mermaid diagram
    if (parsed.mermaid_diagram) {
        markdown += `### Change Flow\n\n`
        const diagram = (parsed.mermaid_diagram as string).replace(/\\n/g, '\n')
        markdown += `\`\`\`mermaid\n${diagram}\n\`\`\`\n\n`
    }

    // Risk assessment
    if (parsed.risk_assessment) {
        const ra = parsed.risk_assessment
        const riskEmoji = ra.level === 'low' ? '🟢' : ra.level === 'medium' ? '🟡' : '🔴'
        markdown += `### ${riskEmoji} Risk Assessment: ${ra.score}/10 (${ra.level})\n\n`
        if (ra.factors && ra.factors.length > 0) {
            for (const factor of ra.factors) {
                markdown += `- ${factor}\n`
            }
            markdown += '\n'
        }
    }

    // File walkthrough
    if (parsed.file_walkthrough && parsed.file_walkthrough.length > 0) {
        markdown += `### File Walkthrough\n\n`
        markdown += `| File | Change | Summary |\n|---|---|---|\n`
        for (const fw of parsed.file_walkthrough) {
            const icon = fw.importance === 'critical' ? '🔴' : fw.importance === 'important' ? '🟡' : '🔵'
            markdown += `| ${icon} \`${fw.path}\` | ${fw.change_type} | ${fw.summary} |\n`
        }
        markdown += '\n'
    }

    // Coaching callout
    if (devProfile && devProfile.totalReviews > 0 && devProfile.weakAreas) {
        const weakAreas = typeof devProfile.weakAreas === 'object' ? devProfile.weakAreas : {}
        const topWeakAreas = Object.entries(weakAreas)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 3)
            .map(([area, count]: [string, any]) => `${area.replace(/_/g, ' ')} (${count}x)`)

        if (topWeakAreas.length > 0) {
            markdown += `### Developer Context\n\n`
            markdown += `> @${devProfile.githubLogin} has ${devProfile.totalReviews} reviews. `
            markdown += `Watch for: ${topWeakAreas.join(', ')}.\n\n`
        }
    }

    markdown += `---\n*Archon will post detailed inline comments in a separate review.*`

    // Post as a regular issue comment
    await octokit.rest.issues.createComment({
        owner, repo, issue_number: issueNumber,
        body: markdown,
    })

    console.log(`Posted PR summary with Mermaid diagram for PR #${issueNumber}`)
    return { inputTokens, outputTokens }
}

// ── Full Diagram ──────────────────────────────────────────────────────

export async function generateFullDiagram(
    octokit: Octokit, owner: string, repo: string, issueNumber: number,
    provider: string, apiKey: string, model: string, isPR: boolean
): Promise<ReviewResult> {
    let prompt = ''

    if (isPR) {
        // PR diagram: show changes in context
        const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: issueNumber })
        const { data: files } = await octokit.rest.pulls.listFiles({
            owner, repo, pull_number: issueNumber, per_page: 100,
        })

        prompt = `## PR #${issueNumber}: ${pr.title}\n\n`
        prompt += `**Author:** ${pr.user?.login} | **Branch:** ${pr.head.ref} -> ${pr.base.ref}\n\n`
        prompt += `### Files Changed (${files.length})\n\n`
        for (const f of files) {
            prompt += `- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`
            if (f.patch && f.patch.length < 3000) {
                prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n`
            }
        }
        prompt += `\nGenerate a COMPREHENSIVE Mermaid diagram showing how these PR changes flow through the system. Include existing components that interact with the changes.`
    } else {
        // Issue/project diagram: scan the whole repo
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo })

        // Fetch file tree
        let tree: Array<{ path: string; type: string }> = []
        try {
            const { data: treeData } = await octokit.rest.git.getTree({
                owner, repo, tree_sha: repoData.default_branch, recursive: 'true',
            })
            tree = (treeData.tree || [])
                .filter((t: any) => t.type === 'blob')
                .map((t: any) => ({ path: t.path || '', type: 'blob' }))
        } catch { /* ok */ }

        // Read key config files for context
        const keyFiles = ['package.json', 'tsconfig.json', 'Dockerfile', 'docker-compose.yml', '.env.example']
        let configContext = ''
        for (const kf of keyFiles) {
            try {
                const { data } = await octokit.rest.repos.getContent({ owner, repo, path: kf })
                if ('content' in data && data.content) {
                    const content = Buffer.from(data.content, 'base64').toString('utf-8')
                    configContext += `\n### ${kf}\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\`\n`
                }
            } catch { /* file doesn't exist */ }
        }

        // Load project memory if it exists
        const memoryContext = await loadProjectMemory(octokit, owner, repo)

        prompt = `## Project: ${repoData.full_name}\n\n`
        prompt += `**Description:** ${repoData.description || 'No description'}\n`
        prompt += `**Language:** ${repoData.language || 'Unknown'}\n\n`
        prompt += `### File Structure (${tree.length} files)\n\n`

        // Group by directory
        const dirs = new Map<string, string[]>()
        for (const t of tree) {
            const parts = t.path.split('/')
            const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.'
            if (!dirs.has(dir)) dirs.set(dir, [])
            dirs.get(dir)!.push(parts[parts.length - 1])
        }
        for (const [dir, files] of Array.from(dirs.entries()).slice(0, 30)) {
            prompt += `📁 ${dir}/\n`
            for (const f of files.slice(0, 10)) {
                prompt += `  - ${f}\n`
            }
            if (files.length > 10) prompt += `  ... and ${files.length - 10} more\n`
        }

        if (configContext) prompt += `\n### Key Config Files\n${configContext}`
        if (memoryContext) prompt += `\n### Project Memory\n${memoryContext.substring(0, 3000)}\n`

        prompt += `\nGenerate a COMPREHENSIVE Mermaid diagram showing the FULL project architecture. Include all major modules, services, data flows, database, APIs, and frontend components. Make it detailed enough to serve as an architecture reference.`
    }

    if (prompt.length > 120000) {
        prompt = truncatePrompt(prompt, 120000, 'diagram')
    }

    const { text, inputTokens, outputTokens } = await callAI(DIAGRAM_PROMPT, prompt, provider, apiKey, model, 8192)
    const parsed = parseJSON(text)

    // Build markdown output
    let markdown = `## Archon Architecture Diagram\n\n`

    if (parsed.title) {
        markdown += `### ${parsed.title}\n\n`
    }

    if (parsed.description) {
        markdown += `${parsed.description}\n\n`
    }

    if (parsed.mermaid) {
        const diagram = (parsed.mermaid as string).replace(/\\n/g, '\n')
        markdown += `\`\`\`mermaid\n${diagram}\n\`\`\`\n\n`
    } else {
        markdown += `> Diagram generation failed. The AI did not return valid Mermaid syntax.\n\n`
    }

    markdown += `---\n*Generated by Archon. Use \`/archon diagram\` anytime to regenerate.*`

    // Post as comment
    await octokit.rest.issues.createComment({
        owner, repo, issue_number: issueNumber,
        body: markdown,
    })

    console.log(`Posted full diagram for ${isPR ? 'PR' : 'project'} #${issueNumber}`)

    return {
        summary: markdown,
        verdict: 'COMMENT',
        inlineComments: [],
        securityIssues: [],
        filesReviewed: 0,
        inputTokens,
        outputTokens,
    }
}

// ── Issue Analysis ────────────────────────────────────────────────────

export async function runIssueAnalysis(
    octokit: Octokit, owner: string, repo: string, issueNumber: number,
    provider: string, apiKey: string, model: string,
    actionType: string = 'review', requestedBy?: string
): Promise<ReviewResult> {
    // Fetch issue if we have a real issue number; frontend-triggered scans have issueNumber=0
    let issueTitle = 'Full Codebase Scan'
    let issueBody = `Perform a full ${actionType} of the entire codebase. No specific issue — analyze all key files.`
    let issueLabels = ''

    if (issueNumber > 0) {
        const { data: issueData } = await octokit.rest.issues.get({ owner, repo, issue_number: issueNumber })
        issueTitle = issueData.title || ''
        issueBody = issueData.body || '(no description)'
        issueLabels = (issueData.labels || []).map((l: any) => typeof l === 'string' ? l : l.name).join(', ')
    }

    // 1. Fetch repo tree for codebase context
    let rawTree: Array<{ path: string }> = []
    let defaultBranch = 'main'
    try {
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
        defaultBranch = repoData.default_branch || 'main'
        const { data: treeData } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: defaultBranch, recursive: 'true',
        })
        rawTree = (treeData.tree || [])
            .filter((t: any) => t.type === 'blob')
            .map((t: any) => ({ path: t.path || '' }))
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
        console.warn(`Issue analysis: repo tree fetch failed: ${err.message}`)
    }

    // 2. Select key files (security-relevant + structural)
    const keyFilePaths = selectSecurityKeyFiles(rawTree)
    console.log(`Issue analysis: selected ${keyFilePaths.length} key files from ${rawTree.length} total`)

    // 3. Fetch file contents (up to 200 lines each to stay within token budget)
    let fileContext = ''
    let filesFetched = 0
    for (const filePath of keyFilePaths) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path: filePath, ref: defaultBranch,
            })
            if ('content' in data && typeof data.content === 'string') {
                const raw = Buffer.from(data.content, 'base64').toString('utf-8')
                const trimmed = raw.split('\n').slice(0, 200).join('\n')
                fileContext += `\n<file path="${filePath}">\n${trimmed}\n</file>\n`
                filesFetched++
            }
        } catch { /* binary or inaccessible file */ }
    }

    // 4. Load project memory for additional context
    let memoryContext = ''
    try {
        const memory = await loadProjectMemory(octokit, owner, repo)
        if (memory) memoryContext = `\n## Project Memory (from .archon/memory.md)\n${memory}\n`
    } catch { /* non-fatal */ }

    // 5. Build combined codebase context
    const codebaseContext = [
        `## Codebase: ${owner}/${repo}`,
        `### File Tree (${rawTree.length} total files)`,
        '```',
        rawTree.map(t => t.path).join('\n').substring(0, 3000),
        '```',
        memoryContext,
        `### Key File Contents (${filesFetched} files)`,
        fileContext,
    ].join('\n')

    const issueContext = [
        issueNumber > 0 ? `## Issue #${issueNumber}: ${issueTitle}` : `## Codebase Scan Request`,
        `**Labels:** ${issueLabels || 'none'}`,
        '',
        issueBody,
    ].join('\n')

    // 6. Build action-specific system prompt and user prompt
    let systemPrompt: string
    let userPrompt: string

    if (actionType === 'security') {
        systemPrompt = `You are Archon Security Scanner. A developer has raised an issue — use it to understand their concern, then scan the actual codebase for real security vulnerabilities.

Respond in this exact JSON format:
{
  "summary": "Clear security assessment of the codebase in context of the issue",
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "inline_comments": [],
  "security_issues": [
    {
      "severity": "critical" | "high" | "medium" | "low",
      "file": "path/to/file.ts",
      "line": 1,
      "description": "What the vulnerability is and how it is exploitable",
      "recommendation": "Specific fix"
    }
  ]
}

Only report real, exploitable vulnerabilities with clear data flow from user input to sink. Always respond with valid JSON only.`

        userPrompt = `${issueContext}

---

Use the issue above as context for what the developer is concerned about, then analyze the codebase below for actual security vulnerabilities.

${codebaseContext}`

    } else if (actionType === 'explain') {
        systemPrompt = `You are Archon, an expert at explaining codebases clearly to developers.
A developer has raised an issue asking about the project — explain the relevant parts of the codebase.

Rules:
- If the issue asks about a specific feature, file, or concept → focus your explanation there with code references
- If the issue is vague or asks about the overall project → give a structured overview: architecture, key files, how pieces connect
- Always refer to actual files from the codebase provided
- Be clear and educational, not just descriptive`

        userPrompt = `${issueContext}

---

Explain the codebase in response to the issue above. Reference specific files and code patterns from the codebase below.

${codebaseContext}`

    } else {
        // Default: review mode — treat issue as the focus area for code review
        systemPrompt = `You are Archon, an expert AI code reviewer. A developer has raised an issue — use it as context and review the actual codebase for related problems.

Respond in this exact JSON format:
{
  "summary": "Overall assessment referencing both the issue and actual code findings",
  "verdict": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "inline_comments": [
    {
      "path": "relative/file/path.ts",
      "line": 1,
      "severity": "critical" | "warning" | "suggestion" | "info",
      "body": "Specific finding with explanation and fix suggestion"
    }
  ],
  "security_issues": []
}

Review the real code files. The issue provides the focus area and user intent. Always respond with valid JSON only.`

        userPrompt = `${issueContext}

---

Review the codebase below with the above issue as your focus area. Find bugs, code quality issues, or improvements in the actual code files that relate to what the issue describes. If the issue is vague, provide a general review of the key files.

${codebaseContext}`
    }

    if (userPrompt.length > 100000) {
        userPrompt = truncatePrompt(userPrompt, 100000, 'issue-analysis')
    }

    console.log(`Issue analysis (${actionType}): sending ${userPrompt.length} chars to AI...`)
    const { text, inputTokens, outputTokens } = await callAI(
        systemPrompt, userPrompt, provider, apiKey, model, 4096
    )

    // Parse JSON response for review/security modes
    let summary = text
    let securityIssues: SecurityIssue[] = []
    let inlineComments: InlineComment[] = []

    if (actionType === 'security' || actionType === 'review') {
        try {
            const parsed = parseJSON(text)
            summary = parsed.summary || text
            securityIssues = (parsed.security_issues || []).map((s: any) => ({
                severity: s.severity || 'medium',
                file: s.file || '',
                line: s.line || 0,
                description: s.description || '',
                recommendation: s.recommendation || '',
            }))
            inlineComments = (parsed.inline_comments || []).map((c: any) => ({
                path: c.path || '',
                line: c.line || 1,
                side: 'RIGHT',
                body: c.body || '',
                severity: c.severity || 'info',
                suggested_fix: c.suggested_fix,
            }))
        } catch { /* use raw text as summary */ }
    }

    // Build formatted GitHub comment
    const actionLabel = actionType === 'security' ? '🔒 Security Scan' :
                        actionType === 'explain'  ? '📖 Codebase Explanation' :
                        '🔍 Code Review'

    let comment = `## ${actionLabel} — Issue #${issueNumber} Context\n\n`

    if (actionType === 'explain') {
        comment += summary
    } else {
        comment += summary
        if (inlineComments.length > 0) {
            comment += `\n\n### Findings (${inlineComments.length})\n`
            for (const ic of inlineComments.slice(0, 10)) {
                const sev = ic.severity?.toUpperCase() || 'INFO'
                const sevEmoji: Record<string, string> = { CRITICAL: '🔴', WARNING: '🟡', SUGGESTION: '🔵', INFO: '⚪' }
                comment += `\n**${sevEmoji[sev] || ''} ${sev}** — \`${ic.path}\` line ${ic.line}\n${ic.body}\n`
            }
        }
        if (securityIssues.length > 0) {
            comment += `\n\n### Security Issues (${securityIssues.length})\n`
            for (const s of securityIssues.slice(0, 8)) {
                const sev = s.severity?.toUpperCase() || 'MEDIUM'
                const sevEmoji: Record<string, string> = { CRITICAL: '🔴', HIGH: '🟠', MEDIUM: '🟡', LOW: '🟢' }
                comment += `\n**${sevEmoji[sev] || ''} ${sev}** — \`${s.file}\`\n${s.description}\n> Fix: ${s.recommendation}\n`
            }
        }
    }

    comment += `\n\n---\n*Archon analyzed ${filesFetched} key codebase files using the issue as context. Triggered by @${requestedBy || 'team'} via \`/archon ${actionType}\`.*`

    // Post comment to GitHub issue (skip for frontend-triggered scans with no issue)
    if (issueNumber > 0) {
        try {
            await octokit.rest.issues.createComment({
                owner, repo, issue_number: issueNumber, body: comment,
            })
        } catch (err: any) {
            console.warn(`Could not post issue analysis comment: ${err.message}`)
        }
    }

    return {
        summary,
        verdict: 'COMMENT',
        inlineComments,
        securityIssues,
        filesReviewed: filesFetched,
        inputTokens,
        outputTokens,
    }
}

// ── Intent Validation ─────────────────────────────────────────────────

export async function runIntentValidation(
    ctx: PRContext,
    linkedIssue: { number: number; title: string; body: string },
    provider: string, apiKey: string, model: string
): Promise<{ analysis: IntentAnalysis; inputTokens: number; outputTokens: number }> {
    let diffSummary = ''
    for (const f of ctx.filesChanged) {
        if (f.patch) diffSummary += `--- ${f.filename} ---\n${f.patch}\n\n`
    }
    if (diffSummary.length > 60000) {
        diffSummary = truncatePrompt(diffSummary, 60000, 'intent-validation-diff')
    }

    const prompt = `## Linked Issue #${linkedIssue.number}
**Title:** ${linkedIssue.title}
**Body:** ${linkedIssue.body || '(no description)'}

---

## Pull Request #${ctx.number}
**Title:** ${ctx.title}
**Body:** ${ctx.body || '(no description)'}

### Files Changed
${ctx.filesChanged.map(f => `- ${f.filename} (${f.status}, +${f.additions} -${f.deletions})`).join('\n')}

### Diff Summary
${diffSummary}`

    const { text, inputTokens, outputTokens } = await callAI(INTENT_PROMPT, prompt, provider, apiKey, model, 2048)
    const parsed = parseJSON(text)

    return {
        analysis: {
            matches: parsed.matches ?? true,
            score: parsed.score ?? 100,
            linkedIssue,
            mismatches: (parsed.mismatches || []).map((m: any) => ({
                requirement: m.requirement || '',
                status: m.status || 'missing',
                explanation: m.explanation || '',
            })),
        },
        inputTokens,
        outputTokens,
    }
}

// ── AI Code Audit ─────────────────────────────────────────────────────

export async function runAICodeAudit(
    ctx: PRContext, provider: string, apiKey: string, model: string
): Promise<{ analysis: AIPatternAnalysis; inputTokens: number; outputTokens: number }> {
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n### Files Changed\n`
    for (const f of ctx.filesChanged) {
        prompt += `#### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`
        if (f.patch) prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n`
        if (f.contents && f.contents.length < 8000) {
            prompt += `<full_file path="${f.filename}">\n${f.contents}\n</full_file>\n`
        }
    }

    if (prompt.length > 120000) {
        prompt = truncatePrompt(prompt, 120000, 'ai-audit')
    }

    const { text, inputTokens, outputTokens } = await callAI(AI_AUDIT_PROMPT, prompt, provider, apiKey, model, 4096)
    const parsed = parseJSON(text)

    return {
        analysis: {
            detected: parsed.detected ?? false,
            confidence: parsed.confidence ?? 0,
            patterns: (parsed.patterns || []).map((p: any) => ({
                file: p.file || '',
                line: p.line || 0,
                pattern: p.pattern || 'generic-naming',
                description: p.description || '',
                severity: p.severity || 'low',
            })),
        },
        inputTokens,
        outputTokens,
    }
}

// ── Test Generation ───────────────────────────────────────────────────

export async function runTestGeneration(
    octokit: Octokit, owner: string, repo: string,
    ctx: PRContext, provider: string, apiKey: string, model: string,
    requestedBy?: string
): Promise<ReviewResult> {
    // Find existing test files for patterns
    let testPatternSample = ''
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })

    // Look for existing test files
    try {
        const { data: tree } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: repoData.default_branch, recursive: 'true',
        })
        const testFiles = tree.tree
            .filter((t: any) => t.type === 'blob' && /\.(test|spec)\.\w+$/.test(t.path || ''))
            .map((t: any) => t.path)
            .slice(0, 3)

        for (const tf of testFiles) {
            try {
                const { data } = await octokit.rest.repos.getContent({ owner, repo, path: tf })
                if ('content' in data && data.content) {
                    const content = Buffer.from(data.content, 'base64').toString('utf-8')
                    testPatternSample += `\n### Existing test pattern (${tf}):\n\`\`\`\n${content.substring(0, 2000)}\n\`\`\`\n`
                }
            } catch { /* skip */ }
        }
    } catch { /* no tree access */ }

    // Build prompt
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n### Changed Files\n\n`
    for (const f of ctx.filesChanged) {
        if (f.status === 'removed') continue
        prompt += `#### ${f.filename}\n`
        if (f.contents) {
            prompt += `\`\`\`\n${f.contents.substring(0, 5000)}\n\`\`\`\n\n`
        } else if (f.patch) {
            prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n\n`
        }
    }
    if (testPatternSample) {
        prompt += `### Existing Test Patterns (match this style)\n${testPatternSample}\n`
    }
    prompt += '\nGenerate comprehensive tests for the changed code above.'

    if (prompt.length > 120000) {
        prompt = truncatePrompt(prompt, 120000, 'test-generation')
    }

    const { text, inputTokens, outputTokens } = await callAI(TEST_GENERATION_PROMPT, prompt, provider, apiKey, model, 8192)
    const parsed = parseJSON(text)

    if (!parsed.files || parsed.files.length === 0) {
        return {
            summary: parsed.summary || 'No tests could be generated.',
            verdict: 'COMMENT', inlineComments: [], securityIssues: [],
            filesReviewed: ctx.filesChanged.length, inputTokens, outputTokens,
            filesModified: [],
        }
    }

    // Validate generated tests — Feature 4.2
    try {
        const validation = await validateGeneratedCode(parsed.files, provider, apiKey, model)
        parsed.files = validation.files
    } catch { /* non-fatal */ }

    // Create test branch and PR
    const defaultBranch = repoData.default_branch
    const branchName = `archon/tests-pr-${ctx.number}-${Date.now()}`
    await createBranch(octokit, owner, repo, branchName, defaultBranch)

    const coAuthor = requestedBy ? { name: requestedBy, email: `${requestedBy}@users.noreply.github.com` } : undefined
    const filesModified: string[] = []

    for (const file of parsed.files) {
        if (!file.path || !file.content) continue
        try {
            await commitFile(octokit, owner, repo, branchName, file.path, file.content, true, undefined, coAuthor)
            filesModified.push(file.path)
        } catch (err: any) {
            console.warn(`Failed to commit test ${file.path}: ${err.message}`)
        }
    }

    if (filesModified.length === 0) {
        return {
            summary: 'Test generation succeeded but no files could be committed.',
            verdict: 'COMMENT', inlineComments: [], securityIssues: [],
            filesReviewed: ctx.filesChanged.length, inputTokens, outputTokens,
            filesModified: [],
        }
    }

    const prBody = `## AI-Generated Tests by Archon\n\n${parsed.summary || 'Tests generated for PR changes.'}\n\n**Test files:**\n${filesModified.map(f => '- \`' + f + '\`').join('\n')}\n\n---\n*Generated from PR #${ctx.number}*`

    const { data: newPR } = await octokit.rest.pulls.create({
        owner, repo,
        title: parsed.commit_message || `test: add tests for PR #${ctx.number}`,
        body: prBody,
        head: branchName,
        base: defaultBranch,
    })

    await octokit.rest.issues.createComment({
        owner, repo, issue_number: ctx.number,
        body: `Archon generated tests in PR #${newPR.number}.\n\n${parsed.summary || ''}\n\n**Files:** ${filesModified.map(f => '\`' + f + '\`').join(', ')}`,
    })

    return {
        summary: `Test PR #${newPR.number} created with ${filesModified.length} test file(s).`,
        verdict: 'COMMENT', inlineComments: [], securityIssues: [],
        filesReviewed: ctx.filesChanged.length, inputTokens, outputTokens,
        branchName, prNumber: newPR.number, filesModified,
    }
}

// ── Documentation Generation ─────────────────────────────────────────

export async function runDocsGeneration(
    octokit: Octokit, owner: string, repo: string,
    prNumber: number | null,
    provider: string, apiKey: string, model: string,
    requestedBy?: string
): Promise<ReviewResult> {
    // Fetch key files for documentation context
    const filesToDoc = [
        'package.json', 'README.md', 'src/index.ts', 'src/index.js',
        'src/app.ts', 'src/app.js', 'src/main.ts', 'src/main.py',
        'Dockerfile', 'docker-compose.yml', '.env.example',
    ]

    let contextContent = ''
    let filesFetched = 0

    for (const filePath of filesToDoc) {
        try {
            const { data } = await octokit.rest.repos.getContent({ owner, repo, path: filePath })
            if ('content' in data && typeof data.content === 'string') {
                const content = Buffer.from(data.content, 'base64').toString('utf-8')
                contextContent += `<file path="${filePath}">\n${content.substring(0, 3000)}\n</file>\n\n`
                filesFetched++
            }
        } catch { /* file doesn't exist */ }
    }

    // Also list src/ directory for structure
    try {
        const { data: srcFiles } = await octokit.rest.repos.getContent({ owner, repo, path: 'src' })
        if (Array.isArray(srcFiles)) {
            const fileList = srcFiles.slice(0, 30).map((f: any) => `  - ${f.name}`).join('\n')
            contextContent += `\n<directory path="src/">\n${fileList}\n</directory>\n`
        }
    } catch { /* no src dir */ }

    if (!contextContent) {
        return {
            summary: 'Could not fetch project files to generate documentation.',
            verdict: 'COMMENT', inlineComments: [], securityIssues: [],
            filesReviewed: 0, inputTokens: 0, outputTokens: 0,
        }
    }

    const userPrompt = `Repository: ${owner}/${repo}

${contextContent}

Generate a comprehensive README.md for this project based on the actual code above.`

    const { text, inputTokens, outputTokens } = await callAI(DOCS_SYSTEM_PROMPT, userPrompt, provider, apiKey, model, 4096)

    // Commit README.md to repo if it doesn't exist or update it
    const coAuthor = requestedBy ? { name: requestedBy, email: `${requestedBy}@users.noreply.github.com` } : undefined

    let committed = false
    try {
        const branchName = `archon/docs-${Date.now()}`
        const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
        await createBranch(octokit, owner, repo, branchName, repoData.default_branch)
        await commitFile(octokit, owner, repo, branchName, 'README.md', text, false, 'docs: update README via Archon', coAuthor)

        const { data: pr } = await octokit.rest.pulls.create({
            owner, repo,
            title: 'docs: update README via Archon',
            body: `## Auto-generated Documentation\n\nArchon generated this README based on your project's code.\n\nReview and merge to update your documentation.`,
            head: branchName,
            base: repoData.default_branch,
        })

        committed = true
        const summary = `## Archon Docs\n\n📚 Documentation generated and submitted as PR #${pr.number}.\n\nReview it at: ${pr.html_url}\n\n<details><summary>Preview generated README</summary>\n\n${text.substring(0, 2000)}...\n\n</details>`

        return { summary, verdict: 'COMMENT', inlineComments: [], securityIssues: [], filesReviewed: filesFetched, inputTokens, outputTokens }
    } catch (err: any) {
        console.warn('Could not create docs PR (non-fatal):', err.message)
    }

    if (!committed) {
        // Fall back to posting as comment
        return {
            summary: `## Archon Docs — Generated README\n\n${text}`,
            verdict: 'COMMENT', inlineComments: [], securityIssues: [],
            filesReviewed: filesFetched, inputTokens, outputTokens,
        }
    }

    return { summary: 'Documentation generated.', verdict: 'COMMENT', inlineComments: [], securityIssues: [], filesReviewed: filesFetched, inputTokens, outputTokens }
}
