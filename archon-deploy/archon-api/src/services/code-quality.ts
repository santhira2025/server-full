/**
 * Code Quality Service (Features 3.1, 3.2, 3.3)
 *
 * 3.1 — Complexity Scoring: cyclomatic + cognitive complexity for changed functions
 * 3.2 — Test Coverage Correlation: detect when changed code lacks test changes
 * 3.3 — Dead Code Detection: flag new exports not imported anywhere
 */
import type { RepoMap } from "./repo-map.js"

// ══════════════════════════════════════════════════════════════════════
// Feature 3.1: Complexity Scoring
// ══════════════════════════════════════════════════════════════════════

export interface ComplexityResult {
    file: string
    functions: FunctionComplexity[]
    totalDelta: number
}

interface FunctionComplexity {
    name: string
    complexity: number
    cognitiveComplexity: number
    lineStart: number
}

/**
 * Calculate cyclomatic complexity from code.
 * Counts decision points: if, else if, while, for, switch cases, catch,
 * ternary, &&, ||, ??
 */
export function calculateComplexity(code: string): number {
    let complexity = 1

    // Count else-if first, then strip them so bare `if` doesn't double-count
    const elseIfMatches = code.match(/\belse\s+if\b/g)
    if (elseIfMatches) complexity += elseIfMatches.length
    const codeWithoutElseIf = code.replace(/\belse\s+if\b/g, '      ')

    const patterns = [
        /\bif\b/g, /\bwhile\b/g, /\bfor\b/g,
        /\bcase\b/g, /\bcatch\b/g,
        /&&/g, /\|\|/g, /\?\?/g,
    ]

    for (const pattern of patterns) {
        const matches = codeWithoutElseIf.match(pattern)
        if (matches) complexity += matches.length
    }

    // Ternary operators (avoid matching ?. optional chaining and ?: optional params)
    const ternary = codeWithoutElseIf.match(/\?\s*[^.?:]/g)
    if (ternary) complexity += ternary.length

    return complexity
}

/**
 * Calculate cognitive complexity (nesting-aware).
 * Deeper nesting = higher penalty per decision point.
 */
export function calculateCognitiveComplexity(code: string): number {
    let complexity = 0
    let nestingLevel = 0
    const lines = code.split('\n')

    for (const line of lines) {
        const trimmed = line.trim()

        // Track nesting by braces
        const opens = (trimmed.match(/\{/g) || []).length
        const closes = (trimmed.match(/\}/g) || []).length

        // Decision points with nesting penalty
        if (/\b(if|else\s+if|while|for|switch|catch)\b/.test(trimmed)) {
            complexity += 1 + nestingLevel
        }

        // Logical operators
        const logicalOps = (trimmed.match(/&&|\|\||\?\?/g) || []).length
        complexity += logicalOps

        nestingLevel += opens - closes
        if (nestingLevel < 0) nestingLevel = 0
    }

    return complexity
}

/**
 * Extract functions from a file and calculate their complexity.
 */
export function analyzeFileComplexity(code: string, filename: string): ComplexityResult {
    const functions: FunctionComplexity[] = []
    const lines = code.split('\n')

    // Simple function detection via regex
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        const funcMatch = line.match(
            /^(?:export\s+)?(?:async\s+)?function\s+(\w+)|^(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(|^(?:async\s+)?def\s+(\w+)|^func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)/
        )

        if (funcMatch) {
            const name = funcMatch[1] || funcMatch[2] || funcMatch[3] || funcMatch[4]
            // Extract function body (rough: from first { to matching })
            let braceCount = 0
            let funcBody = ''
            let started = false

            for (let j = i; j < Math.min(i + 200, lines.length); j++) {
                funcBody += lines[j] + '\n'
                braceCount += (lines[j].match(/\{/g) || []).length
                braceCount -= (lines[j].match(/\}/g) || []).length
                if (braceCount > 0) started = true
                if (started && braceCount <= 0) break
            }

            functions.push({
                name,
                complexity: calculateComplexity(funcBody),
                cognitiveComplexity: calculateCognitiveComplexity(funcBody),
                lineStart: i + 1,
            })
        }
    }

    const totalDelta = functions.reduce((sum, f) => sum + f.complexity, 0)

    return { file: filename, functions, totalDelta }
}

/**
 * Build complexity report for changed files.
 */
export function buildComplexityReport(
    changedFiles: Array<{ filename: string; contents?: string }>
): string {
    const results: ComplexityResult[] = []

    for (const file of changedFiles) {
        if (!file.contents) continue
        const result = analyzeFileComplexity(file.contents, file.filename)
        if (result.functions.length > 0) results.push(result)
    }

    if (results.length === 0) return ''

    let report = '\n\n=== COMPLEXITY ANALYSIS ===\n'

    for (const result of results) {
        const highComplexity = result.functions.filter(f => f.complexity >= 10)
        const veryHigh = result.functions.filter(f => f.cognitiveComplexity >= 15)

        for (const func of highComplexity) {
            const icon = func.complexity >= 20 ? '🔴' : func.complexity >= 10 ? '🟡' : '🟢'
            report += `${icon} ${result.file}:${func.name} — cyclomatic: ${func.complexity}, cognitive: ${func.cognitiveComplexity}\n`
        }

        for (const func of veryHigh) {
            if (!highComplexity.includes(func)) {
                report += `🟡 ${result.file}:${func.name} — high cognitive complexity: ${func.cognitiveComplexity}\n`
            }
        }
    }

    return report
}

// ══════════════════════════════════════════════════════════════════════
// Feature 3.2: Test Coverage Correlation
// ══════════════════════════════════════════════════════════════════════

export interface TestCoverageGap {
    sourceFile: string
    testFile: string | null
    hasTestChanges: boolean
    newFunctions: string[]
}

/**
 * Detect when changed source files lack corresponding test changes.
 */
export function detectTestCoverageGaps(
    changedFiles: Array<{ filename: string; patch: string; contents?: string }>,
    allRepoFiles: string[]
): TestCoverageGap[] {
    const gaps: TestCoverageGap[] = []
    const changedPaths = new Set(changedFiles.map(f => f.filename))
    const allFilesSet = new Set(allRepoFiles)

    for (const file of changedFiles) {
        // Skip test files, config files, non-source files
        if (/\.(test|spec)\.\w+$/.test(file.filename)) continue
        if (/\.(json|yml|yaml|md|css|html|svg|lock)$/.test(file.filename)) continue
        if (/^\./.test(file.filename.split('/').pop() || '')) continue

        // Find corresponding test file
        const base = file.filename.replace(/\.[^.]+$/, '')
        const ext = file.filename.split('.').pop() || 'ts'

        const testCandidates = [
            `${base}.test.${ext}`,
            `${base}.spec.${ext}`,
            file.filename.replace(/^src\//, 'tests/').replace(/\.[^.]+$/, `.test.${ext}`),
            file.filename.replace(/^src\//, '__tests__/').replace(/\.[^.]+$/, `.test.${ext}`),
        ]

        let testFile: string | null = null
        for (const candidate of testCandidates) {
            if (allFilesSet.has(candidate)) {
                testFile = candidate
                break
            }
        }

        const hasTestChanges = testFile ? changedPaths.has(testFile) : false

        // Detect new functions from the patch
        const newFunctions: string[] = []
        if (file.patch) {
            const addedLines = file.patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
            for (const line of addedLines) {
                const funcMatch = line.match(
                    /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:async\s+)?def\s+(\w+)|^func\s+(\w+)/
                )
                if (funcMatch) {
                    newFunctions.push(funcMatch[1] || funcMatch[2] || funcMatch[3])
                }
            }
        }

        // Flag if: no test file exists, or test file not changed when source has significant changes
        const lineChanges = (file.patch?.split('\n').filter(l => l.startsWith('+') || l.startsWith('-')).length) || 0
        if (!testFile || (!hasTestChanges && lineChanges > 10) || newFunctions.length > 0) {
            gaps.push({ sourceFile: file.filename, testFile, hasTestChanges, newFunctions })
        }
    }

    return gaps
}

/**
 * Build test coverage report for the review prompt.
 */
export function buildTestCoverageReport(gaps: TestCoverageGap[]): string {
    if (gaps.length === 0) return ''

    let report = '\n\n=== TEST COVERAGE GAPS ===\n'

    for (const gap of gaps) {
        if (!gap.testFile) {
            report += `⚠️ ${gap.sourceFile}: No test file found\n`
        } else if (!gap.hasTestChanges) {
            report += `⚠️ ${gap.sourceFile}: Modified but test file ${gap.testFile} was NOT updated\n`
        }

        if (gap.newFunctions.length > 0) {
            report += `  New functions without test coverage: ${gap.newFunctions.join(', ')}\n`
        }
    }

    return report
}

// ══════════════════════════════════════════════════════════════════════
// Feature 3.3: Dead Code Detection
// ══════════════════════════════════════════════════════════════════════

/**
 * Check if newly exported symbols are imported anywhere in the repo.
 */
export function detectDeadExports(
    changedFiles: Array<{ filename: string; patch: string }>,
    repoMap: RepoMap | null
): string {
    if (!repoMap) return ''

    const issues: string[] = []

    for (const file of changedFiles) {
        if (!file.patch) continue

        // Find new exports from the patch
        const addedLines = file.patch.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
        const newExports: string[] = []

        for (const line of addedLines) {
            const exportMatch = line.match(/^[+]\s*export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|interface|type|enum)\s+(\w+)/)
            if (exportMatch) newExports.push(exportMatch[1])
        }

        // Check if these exports are imported anywhere
        for (const exportName of newExports) {
            let isImported = false
            for (const f of repoMap.files) {
                if (f.path === file.filename) continue
                if (f.imports.some(imp => imp.includes(exportName))) {
                    isImported = true
                    break
                }
            }

            if (!isImported) {
                issues.push(`New export \`${exportName}\` in ${file.filename} is not imported anywhere`)
            }
        }
    }

    if (issues.length === 0) return ''

    let report = '\n\n=== POTENTIAL DEAD CODE ===\n'
    for (const issue of issues) {
        report += `ℹ️ ${issue}\n`
    }
    return report
}
