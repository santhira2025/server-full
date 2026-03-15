import { Octokit } from "@octokit/rest"

type SecuritySeverity = "critical" | "high" | "medium" | "low"

export interface ApprovalConfig {
    require_archon_approve?: boolean
    security_threshold?: SecuritySeverity
    max_issues_to_merge?: number
    exempt_labels?: string[]
}

export interface ApprovalInput {
    octokit: Octokit
    owner: string
    repo: string
    prNumber: number
    verdict: string
    inlineCommentsCount: number
    securityIssues: Array<{ severity: string }>
    config?: ApprovalConfig
}

const SEVERITY_ORDER: Record<SecuritySeverity, number> = {
    low: 0,
    medium: 1,
    high: 2,
    critical: 3,
}

function shouldBlockBySecurity(
    threshold: SecuritySeverity,
    issues: Array<{ severity: string }>
): boolean {
    const thresholdRank = SEVERITY_ORDER[threshold]
    return issues.some((i) => {
        const severity = (i.severity || "low").toLowerCase() as SecuritySeverity
        return (SEVERITY_ORDER[severity] ?? 0) >= thresholdRank
    })
}

export async function applyApprovalWorkflow(input: ApprovalInput): Promise<{ blocked: boolean; reason: string }> {
    const {
        octokit, owner, repo, prNumber, verdict, inlineCommentsCount, securityIssues,
        config = {},
    } = input
    const mergedConfig: Required<ApprovalConfig> = {
        require_archon_approve: config.require_archon_approve ?? false,
        security_threshold: (config.security_threshold || "high") as SecuritySeverity,
        max_issues_to_merge: config.max_issues_to_merge ?? 3,
        exempt_labels: config.exempt_labels ?? [],
    }

    const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber })
    const labels = (pr.labels || []).map((l: any) => (typeof l === "string" ? l : l.name || ""))
    const exempted = labels.some((l: string) => mergedConfig.exempt_labels.includes(l))

    let blocked = false
    const reasons: string[] = []
    if (!exempted && mergedConfig.require_archon_approve && verdict !== "APPROVE") {
        blocked = true
        reasons.push(`verdict is ${verdict}`)
    }
    if (!exempted && shouldBlockBySecurity(mergedConfig.security_threshold, securityIssues)) {
        blocked = true
        reasons.push(`security issues at or above ${mergedConfig.security_threshold}`)
    }
    if (!exempted && inlineCommentsCount > mergedConfig.max_issues_to_merge) {
        blocked = true
        reasons.push(`issues count ${inlineCommentsCount} exceeds max ${mergedConfig.max_issues_to_merge}`)
    }

    const description = exempted
        ? "Approval policy exempted by label"
        : blocked
            ? `Merge blocked: ${reasons.join("; ")}`
            : "Approval policy passed"

    await octokit.rest.repos.createCommitStatus({
        owner,
        repo,
        sha: pr.head.sha,
        state: blocked ? "failure" : "success",
        context: "archon/approval",
        description: description.slice(0, 140),
    })

    return {
        blocked,
        reason: description,
    }
}
