import type { PRContext, ReviewResult, SecurityIssue } from './types.js'
import { callAI, truncatePrompt } from './ai-client.js'
import { parseJSON } from './json-utils.js'
import { calculateRiskScore } from '../static-scanner.js'

export async function runCodeReview(
    ctx: PRContext, systemPrompt: string, provider: string, apiKey: string, model: string
): Promise<ReviewResult> {
    let prompt = `## PR #${ctx.number}: ${ctx.title}\n\n`
    prompt += `**Author:** ${ctx.author} | **Branch:** ${ctx.headBranch} -> ${ctx.baseBranch}\n\n`
    if (ctx.body) prompt += `### Description\n${ctx.body}\n\n`

    prompt += `### Files Changed (${ctx.filesChanged.length})\n\n`
    for (const f of ctx.filesChanged) {
        prompt += `#### ${f.filename} (${f.status}, +${f.additions} -${f.deletions})\n`
        if (f.patch) prompt += `\`\`\`diff\n${f.patch}\n\`\`\`\n\n`
        if (f.contents && f.contents.length < 10000) {
            prompt += `<full_file path="${f.filename}">\n${f.contents}\n</full_file>\n\n`
        }
    }

    if (prompt.length > 180000) {
        prompt = truncatePrompt(prompt, 180000, 'review-prompt')
    }

    console.log(`Sending ${prompt.length} chars to ${provider}/${model} for review...`)
    const { text, inputTokens, outputTokens } = await callAI(systemPrompt, prompt, provider, apiKey, model, 8192)
    const parsed = parseJSON(text)

    if (!parsed.summary) {
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

    const securityIssues: SecurityIssue[] = (parsed.security_issues || []).map((s: any) => ({
        severity: s.severity || 'medium',
        file: s.file || '',
        line: s.line || 0,
        title: s.title || undefined,
        description: s.description || '',
        attack_scenario: s.attack_scenario || undefined,
        vulnerable_code: s.vulnerable_code || undefined,
        fixed_code: s.fixed_code || undefined,
        recommendation: s.recommendation || '',
        cwe: s.cwe || undefined,
        owasp: s.owasp || undefined,
    }))

    // Layer 4: Calculate risk score from findings
    const { score: riskScore, level: riskLevel } = calculateRiskScore(securityIssues)

    return {
        summary: parsed.summary,
        verdict: parsed.verdict || 'COMMENT',
        inlineComments: (parsed.inline_comments || []).map((c: any) => ({
            path: c.path,
            line: c.line,
            side: 'RIGHT',
            body: `**${(c.severity || 'info').toUpperCase()}**: ${c.body}`,
            severity: c.severity || 'info',
            suggested_fix: c.suggested_fix || undefined,
        })),
        securityIssues,
        riskScore,
        riskLevel,
        passedChecks: parsed.passed_checks || [],
        filesReviewed: ctx.filesChanged.length,
        inputTokens,
        outputTokens,
    }
}
