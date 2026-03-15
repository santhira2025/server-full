/**
 * Layer 1 — Static Pattern Detection
 * Runs before Claude. Fast, zero API cost.
 * Catches obvious issues: hardcoded secrets, injection patterns, weak crypto.
 */

export interface StaticFinding {
    category: string
    file: string
    line: number
    content: string     // truncated line content
    confidence: 'high'
}

// Each entry: [pattern, mustNotMatch?] — mustNotMatch avoids common false positives
const SECURITY_PATTERNS: Record<string, RegExp[]> = {
    hardcoded_secret: [
        /password\s*[:=]\s*["'][^"'${\s]{4,}["']/gi,
        /api_?key\s*[:=]\s*["'][^"'${\s]{8,}["']/gi,
        /secret\s*[:=]\s*["'][^"'${\s]{8,}["']/gi,
        /token\s*[:=]\s*["'][^"'${\s]{8,}["']/gi,
        /sk-[a-zA-Z0-9]{32,}/g,           // OpenAI API keys
        /ghp_[a-zA-Z0-9]{36}/g,           // GitHub personal tokens
        /AKIA[0-9A-Z]{16}/g,              // AWS access keys
        /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/g,
    ],

    sql_injection: [
        /["'`]\s*\+\s*req\.(body|query|params)\./gi,  // direct user input concat
        /`SELECT\s.+\$\{(?:req|request|input|data)\./gi, // template literal SQL with user input
        /execute\([^)]*\+\s*[a-z]/gi,
    ],

    xss: [
        /\.innerHTML\s*=/gi,
        /dangerouslySetInnerHTML\s*=\s*\{\s*\{/gi,
        /document\.write\(/gi,
        /\beval\s*\(/gi,
        /v-html\s*=/gi,
    ],

    weak_crypto: [
        /\bmd5\s*\(/gi,
        /\bsha1\s*\(/gi,
        /createCipher\s*\(/gi,            // deprecated Node.js API
        /Math\.random\s*\(\).*(?:id|token|key|secret|nonce)/gi,  // random used for security
    ],

    path_traversal: [
        /readFile(?:Sync)?\s*\([^)]*req\.(body|query|params)/gi,
        /path\.(?:join|resolve)\s*\([^)]*req\.(body|query|params)/gi,
    ],

    command_injection: [
        /(?:exec|execSync|spawn|spawnSync)\s*\([^)]*req\.(body|query|params)/gi,
        /(?:exec|execSync|spawn|spawnSync)\s*\(`[^`]*\$\{/gi,  // template literal in exec
    ],

    insecure_config: [
        /rejectUnauthorized\s*:\s*false/gi,
        /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0["']?/gi,
        /verify\s*=\s*False/g,            // Python requests.get(url, verify=False)
        /cors\s*\(\s*\)/gi,               // open CORS — no origin restriction
    ],

    jwt_weak: [
        /jwt\.sign\s*\([^,]+,\s*["']\s*["']/gi,   // empty string secret
        /algorithms?\s*:\s*\[\s*["']none["']/gi,   // algorithm: none
    ],

    // ── NEW: SSRF (Server-Side Request Forgery) ──────────────────────
    ssrf: [
        /fetch\s*\(\s*req\.(body|query|params)/gi,
        /axios\.(?:get|post|put|patch|delete)\s*\(\s*req\.(body|query|params)/gi,
        /fetch\s*\(\s*[a-z_]+\.url\s*\)/gi,          // fetch(config.url) where config comes from user
        /https?\.(?:get|request)\s*\(\s*req\.(body|query|params)/gi,
    ],

    // ── NEW: Prototype Pollution ──────────────────────────────────────
    prototype_pollution: [
        /Object\.assign\s*\(\s*\{\s*\}\s*,\s*req\.(body|query|params)/gi,
        /Object\.assign\s*\([^,]+,\s*req\.(body|query|params)/gi,
        /\[\s*['"]__proto__['"]\s*\]/g,
        /\[\s*['"]constructor['"]\s*\]/g,
    ],

    // ── NEW: NoSQL Injection ──────────────────────────────────────────
    nosql_injection: [
        /\$where\s*:\s*req\.(body|query|params)/gi,
        /find\w*\s*\(\s*req\.(body|query|params)/gi,
        /findOne?\s*\(\s*\{\s*\$where/gi,
    ],

    // ── NEW: Open Redirect ────────────────────────────────────────────
    open_redirect: [
        /res\.redirect\s*\(\s*req\.(body|query|params)/gi,
        /location\s*[:=]\s*req\.(body|query|params)/gi,
    ],
}

// Skip lines that are clearly comments or test files
function isSkippable(line: string, filePath: string): boolean {
    const trimmed = line.trim()
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) return true
    if (/\.(test|spec)\.\w+$/.test(filePath)) return true
    if (/(__tests__|\/tests?\/|\/spec\/)/i.test(filePath)) return true
    return false
}

export function runStaticScan(
    files: Array<{ filename: string; contents?: string; patch?: string }>
): StaticFinding[] {
    const findings: StaticFinding[] = []

    for (const file of files) {
        const content = file.contents || ''
        if (!content) continue

        const lines = content.split('\n')

        for (const [category, patterns] of Object.entries(SECURITY_PATTERNS)) {
            for (const pattern of patterns) {
                lines.forEach((line, i) => {
                    if (isSkippable(line, file.filename)) return

                    // Reset lastIndex on global patterns before each test
                    pattern.lastIndex = 0
                    if (!pattern.test(line)) return

                    // Skip obvious false positives: lines with env var references
                    if (/process\.env\.|os\.environ|getenv\(/i.test(line)) return
                    // Skip if it's a placeholder/example value
                    if (/your[-_]?(?:api[-_]?)?key|<.*>|example|placeholder|xxx/i.test(line)) return
                    // Skip comments that describe the pattern
                    if (/\/\/.*example|\/\/.*sample|\/\/.*todo/i.test(line)) return

                    // Deduplicate by file + line + category
                    const isDup = findings.some(
                        f => f.file === file.filename && f.line === i + 1 && f.category === category
                    )
                    if (!isDup) {
                        findings.push({
                            category,
                            file: file.filename,
                            line: i + 1,
                            content: line.trim().substring(0, 200),
                            confidence: 'high',
                        })
                    }
                })
            }
        }
    }

    return findings
}

export function buildStaticFindingsContext(findings: StaticFinding[]): string {
    if (findings.length === 0) return ''

    const byCat: Record<string, StaticFinding[]> = {}
    for (const f of findings) {
        if (!byCat[f.category]) byCat[f.category] = []
        byCat[f.category].push(f)
    }

    const lines = [
        `\n## Pre-scan Static Analysis (${findings.length} pattern matches — validate these, some may be false positives):`,
    ]
    for (const [cat, items] of Object.entries(byCat)) {
        lines.push(`\n### ${cat.replace(/_/g, ' ').toUpperCase()}`)
        for (const item of items) {
            lines.push(`- \`${item.file}:${item.line}\` → \`${item.content}\``)
        }
    }
    lines.push('')
    return lines.join('\n')
}

export function calculateRiskScore(
    vulnerabilities: Array<{ severity: string }>
): { score: number; level: string } {
    let score = 0
    for (const v of vulnerabilities) {
        switch (v.severity?.toLowerCase()) {
            case 'critical': score += 40; break
            case 'high': score += 20; break
            case 'medium': score += 8; break
            case 'low': score += 2; break
        }
    }
    score = Math.min(score, 100)

    const level = score >= 70 ? 'CRITICAL'
        : score >= 40 ? 'HIGH'
            : score >= 20 ? 'MEDIUM'
                : score >= 5 ? 'LOW'
                    : 'NONE'

    return { score, level }
}
