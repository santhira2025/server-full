/**
 * Shared types for the review engine modules.
 */

export interface FileChange {
    filename: string
    status: string
    additions: number
    deletions: number
    patch: string
    contents?: string
}

export interface PRContext {
    number: number
    title: string
    body: string
    diff: string
    filesChanged: FileChange[]
    baseBranch: string
    headBranch: string
    headSha: string
    author: string
}

export interface InlineComment {
    path: string
    line: number
    side: string
    body: string
    severity: string
    suggested_fix?: string
}

export interface SecurityIssue {
    severity: string
    file: string
    line: number
    title?: string
    description: string
    attack_scenario?: string
    vulnerable_code?: string
    fixed_code?: string
    recommendation: string
    cwe?: string
    owasp?: string
}

export interface IntentAnalysis {
    matches: boolean
    score: number
    linkedIssue?: { number: number; title: string; body: string }
    mismatches: Array<{ requirement: string; status: string; explanation: string }>
}

export interface AIPatternAnalysis {
    detected: boolean
    confidence: number
    patterns: Array<{
        file: string
        line: number
        pattern: string
        description: string
        severity: string
    }>
}

export interface ReviewResult {
    summary: string
    fullReport?: string          // Full markdown report text (for security report downloads)
    verdict: string
    inlineComments: InlineComment[]
    securityIssues: SecurityIssue[]
    intentAnalysis?: IntentAnalysis
    aiPatternAnalysis?: AIPatternAnalysis
    filesReviewed: number
    inputTokens: number
    outputTokens: number
    // Resolve-specific fields
    branchName?: string
    prNumber?: number
    filesModified?: string[]
    // Security scoring
    riskScore?: number          // 0-100
    riskLevel?: string          // CRITICAL/HIGH/MEDIUM/LOW/NONE
    passedChecks?: string[]
    // Coaching fields
    coachingSummary?: string
    // Incremental review
    isIncremental?: boolean
}

export interface ReviewEngineOptions {
    installationId: number
    orgId: string
    repoFullName: string
    issueNumber: number
    actionType: string
    model: string
    provider: string
    apiKey: string
    commentId?: number
    requestedBy?: string
    reviewFocus?: string[]
    enableIntentValidation?: boolean
    enableAIAudit?: boolean
    baseSha?: string
    taskId?: string             // for live progress updates
}
