/**
 * File scoring and selection for security/technical reports.
 */
import { Octokit } from "@octokit/rest"

export function selectSecurityKeyFiles(tree: Array<{ path: string }>): string[] {
    const all = tree.map(t => t.path)

    const score = (p: string): number => {
        const lower = p.toLowerCase()
        // Skip test files entirely
        if (/\.(test|spec)\.\w+$/.test(lower) ||
            lower.includes('__tests__/') ||
            lower.includes('/tests/') ||
            lower.startsWith('tests/')) return -1

        let s = 0
        if (/auth|login|middleware|session|jwt|token/i.test(lower)) s += 100
        if (/routes\/|api\/|controllers\/|handlers\//i.test(lower)) s += 80
        if (/schema\.(ts|js|py)|db\.|query\.|repositor/i.test(lower)) s += 70
        if (/crypto|hash|password|secret|key/i.test(lower)) s += 90
        if (/config\.|\.env\.example/i.test(lower)) s += 60
        if (/package\.json|readme\.md/i.test(lower)) s += 50
        if (/src\/index\.(ts|js)|src\/app\.(ts|js)/i.test(lower)) s += 55
        return s
    }

    return all
        .filter(p => score(p) >= 0)
        .sort((a, b) => score(b) - score(a))
        .slice(0, 25)
}

export function selectBroadKeyFiles(tree: Array<{ path: string }>): string[] {
    const all = tree.map(t => t.path)

    const score = (p: string): number => {
        const lower = p.toLowerCase()
        // Skip test files, build artifacts, lock files
        if (/\.(test|spec)\.\w+$/.test(lower) ||
            lower.includes('__tests__/') ||
            lower.includes('/tests/') ||
            lower.startsWith('tests/') ||
            lower.endsWith('.min.js') ||
            lower.endsWith('.lock') ||
            /package-lock\.json$|yarn\.lock$|pnpm-lock\.yaml$|npm-shrinkwrap\.json$/.test(lower) ||
            lower.endsWith('.sum') ||
            lower.includes('node_modules/') ||
            lower.startsWith('dist/') ||
            lower.startsWith('build/')) return -1

        let s = 0
        // Entry points (highest priority)
        if (/\/(index|app|main|server|start)\.(ts|js|tsx|jsx|py|go|rb)$/.test(lower)) s += 110
        // Auth and security
        if (/auth|login|middleware|session|jwt|token|security|permission|guard/i.test(lower)) s += 100
        // Routes and API handlers
        if (/routes\/|api\/|controllers\/|handlers\/|endpoints\//i.test(lower)) s += 95
        // Services and business logic
        if (/services\/|service\.(ts|js|py|go)$|manager\.(ts|js|py)$|usecase/i.test(lower)) s += 90
        // Database / ORM
        if (/schema\.(ts|js|py)|db\.|query\.|model\.(ts|js|py)|migration|repositor/i.test(lower)) s += 85
        // Webhooks
        if (/webhook|hook\.(ts|js|py|go)/i.test(lower)) s += 80
        // Config and constants
        if (/config\.|\.env\.example|settings\.(ts|js|py)|constants\.(ts|js)/i.test(lower)) s += 75
        // Package manifests
        if (/package\.json$|requirements\.txt$|pyproject\.toml$|go\.mod$|cargo\.toml$/i.test(lower)) s += 70
        // Types and interfaces
        if (/types\.(ts|js)$|interfaces?\.(ts|js)$|models?\.(ts|js|py)$/i.test(lower)) s += 65
        // Frontend pages and components
        if (/pages\/|views\/|components\//i.test(lower)) s += 55
        // Utility files
        if (/utils\/|helpers\/|lib\//i.test(lower)) s += 45
        return s
    }

    return all
        .filter(p => score(p) >= 0)
        .sort((a, b) => score(b) - score(a))
        .slice(0, 75)
}

export async function saveSecurityReport(
    octokit: Octokit, owner: string, repo: string,
    reportPath: string, content: string
): Promise<void> {
    const date = new Date().toISOString().split('T')[0]
    const message = `docs: add Archon security report (${date})`
    const encoded = Buffer.from(content, 'utf-8').toString('base64')

    // Look up existing SHA (file may already exist)
    let sha: string | undefined
    try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: reportPath })
        if ('sha' in data) sha = data.sha
    } catch { /* file does not exist yet — create it */ }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo, path: reportPath, message, content: encoded,
        ...(sha ? { sha } : {}),
    })
}

export function extractTopFindings(text: string): string[] {
    const findings: string[] = []

    // Pass 1: Section 2.6 ranked format — **N. Title** — Severity: CRITICAL/HIGH
    const rankedRe = /\*\*\d+\.\s+([^\*]+)\*\*\s*—\s*Severity:\s*(CRITICAL|HIGH)/gi
    let m: RegExpExecArray | null
    while ((m = rankedRe.exec(text)) !== null && findings.length < 5) {
        findings.push(`**${m[2].toUpperCase()}**: ${m[1].trim()}`)
    }

    if (findings.length >= 3) return findings

    // Pass 2: fallback — table rows with CRITICAL or HIGH in last column
    const tableRe = /\|([^|]+)\|[^|]*\|[^|]*\|\s*(CRITICAL|HIGH)\s*\|/gi
    while ((m = tableRe.exec(text)) !== null && findings.length < 5) {
        const title = m[1].trim().replace(/`/g, '')
        if (title && title !== 'Location') {
            findings.push(`**${m[2].toUpperCase()}**: ${title}`)
        }
    }

    return findings
}
