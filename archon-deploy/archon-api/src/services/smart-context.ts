/**
 * Smart Context Service (Features 1.2, 1.3 — Cursor-Inspired)
 *
 * Replaces "send everything up to 180KB" with intelligent context ranking.
 * Resolves imports, fetches related signatures, and ranks context by relevance.
 */
import { Octokit } from "@octokit/rest"
import type { RepoMap } from "./repo-map.js"
import { getRelatedFiles } from "./repo-map.js"

// ── Types ────────────────────────────────────────────────────────────

interface ContextChunk {
    path: string
    content: string
    signal: 'changed' | 'imported' | 'importer' | 'same_dir' | 'test' | 'memory' | 'repo_map'
    priority: number
    charCount: number
}

interface SmartContextResult {
    chunks: ContextChunk[]
    totalChars: number
    summary: string
}

// ── Token Budgets ───────────────────────────────────────────────────

const BUDGETS = {
    changed:   80000,  // Full diffs of changed files
    imported:  30000,  // Signatures from imported files
    importer:  15000,  // Signatures from files that import changed files
    test:      10000,  // Related test files
    memory:    15000,  // Project memory + repo map
    same_dir:   5000,  // Same directory files
    total:    150000,
}

// ── Test File Detection ─────────────────────────────────────────────

function findTestFile(filePath: string, allFiles: string[]): string | null {
    const base = filePath.replace(/\.[^.]+$/, '')
    const ext = filePath.split('.').pop() || 'ts'

    const candidates = [
        `${base}.test.${ext}`,
        `${base}.spec.${ext}`,
        filePath.replace(/^src\//, 'tests/').replace(/\.[^.]+$/, `.test.${ext}`),
        filePath.replace(/^src\//, '__tests__/').replace(/\.[^.]+$/, `.test.${ext}`),
    ]

    const fileSet = new Set(allFiles)
    for (const candidate of candidates) {
        if (fileSet.has(candidate)) return candidate
    }
    return null
}

// ── Extract Signatures from Source ──────────────────────────────────

function extractSignatures(code: string): string {
    const lines = code.split('\n')
    const signatures: string[] = []

    for (const line of lines) {
        const trimmed = line.trim()
        // Export/function/class/interface/type declarations
        if (/^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let)\s+\w+/.test(trimmed)) {
            signatures.push(trimmed.substring(0, 120))
        }
        // Python defs/classes
        if (/^(?:async\s+)?def\s+\w+|^class\s+\w+/.test(trimmed)) {
            signatures.push(trimmed.substring(0, 120))
        }
        // Go funcs
        if (/^func\s+/.test(trimmed)) {
            signatures.push(trimmed.substring(0, 120))
        }
    }

    return signatures.join('\n')
}

// ── Build Smart Context ─────────────────────────────────────────────

export async function buildSmartContext(
    octokit: Octokit, owner: string, repo: string,
    changedFiles: Array<{ filename: string; patch: string; contents?: string }>,
    repoMap: RepoMap | null,
    projectMemory: string,
    headSha: string,
): Promise<SmartContextResult> {
    const chunks: ContextChunk[] = []
    const changedPaths = changedFiles.map(f => f.filename)
    let usedBudget = 0

    // 1. Changed files (HIGHEST priority) — always include full diff
    for (const file of changedFiles) {
        const content = file.patch || ''
        if (content.length <= BUDGETS.changed) {
            chunks.push({
                path: file.filename,
                content: `=== CHANGED: ${file.filename} ===\n\`\`\`diff\n${content}\n\`\`\``,
                signal: 'changed',
                priority: 100,
                charCount: content.length,
            })
        }
    }

    // 2. Import-based context (HIGH priority) — resolve imports from changed files
    if (repoMap) {
        const { imports: importedFiles, importers } = getRelatedFiles(repoMap, changedPaths)

        // Fetch signatures from imported dependencies
        let importBudget = BUDGETS.imported
        for (const impPath of importedFiles.slice(0, 15)) {
            if (importBudget <= 0) break
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner, repo, path: impPath, ref: headSha,
                })
                if ('content' in data && data.content) {
                    const fullContent = Buffer.from(data.content, 'base64').toString('utf-8')
                    const sigs = extractSignatures(fullContent)
                    if (sigs.length > 0 && sigs.length <= importBudget) {
                        chunks.push({
                            path: impPath,
                            content: `=== IMPORTED BY CHANGED FILES: ${impPath} ===\n${sigs}`,
                            signal: 'imported',
                            priority: 80,
                            charCount: sigs.length,
                        })
                        importBudget -= sigs.length
                    }
                }
            } catch { /* file not found */ }
        }

        // Fetch signatures from importers (downstream impact detection)
        let importerBudget = BUDGETS.importer
        for (const impPath of importers.slice(0, 10)) {
            if (importerBudget <= 0) break
            try {
                const { data } = await octokit.rest.repos.getContent({
                    owner, repo, path: impPath, ref: headSha,
                })
                if ('content' in data && data.content) {
                    const fullContent = Buffer.from(data.content, 'base64').toString('utf-8')
                    const sigs = extractSignatures(fullContent)
                    if (sigs.length > 0 && sigs.length <= importerBudget) {
                        chunks.push({
                            path: impPath,
                            content: `=== DEPENDS ON CHANGED FILES: ${impPath} ===\n${sigs}`,
                            signal: 'importer',
                            priority: 70,
                            charCount: sigs.length,
                        })
                        importerBudget -= sigs.length
                    }
                }
            } catch { /* file not found */ }
        }
    }

    // 3. Test files (MEDIUM priority) — detect missing test coverage
    if (repoMap) {
        const allPaths = repoMap.files.map(f => f.path)
        let testBudget = BUDGETS.test

        for (const changed of changedPaths) {
            if (testBudget <= 0) break
            const testPath = findTestFile(changed, allPaths)
            if (testPath) {
                // Check if test file is also changed
                const alreadyChanged = changedPaths.includes(testPath)
                if (!alreadyChanged) {
                    try {
                        const { data } = await octokit.rest.repos.getContent({
                            owner, repo, path: testPath, ref: headSha,
                        })
                        if ('content' in data && data.content) {
                            const sigs = extractSignatures(
                                Buffer.from(data.content, 'base64').toString('utf-8')
                            )
                            if (sigs.length > 0 && sigs.length <= testBudget) {
                                chunks.push({
                                    path: testPath,
                                    content: `=== TEST FILE (not changed): ${testPath} ===\n${sigs}`,
                                    signal: 'test',
                                    priority: 60,
                                    charCount: sigs.length,
                                })
                                testBudget -= sigs.length
                            }
                        }
                    } catch { /* test file not found */ }
                }
            }
        }
    }

    // 4. Project memory (MEDIUM priority) — always include
    if (projectMemory) {
        const memoryContent = projectMemory.substring(0, BUDGETS.memory)
        chunks.push({
            path: '.archon/memory.md',
            content: memoryContent,
            signal: 'memory',
            priority: 50,
            charCount: memoryContent.length,
        })
    }

    // Sort by priority, trim to total budget
    chunks.sort((a, b) => b.priority - a.priority)

    const result: ContextChunk[] = []
    let totalChars = 0
    for (const chunk of chunks) {
        if (totalChars + chunk.charCount > BUDGETS.total) continue
        result.push(chunk)
        totalChars += chunk.charCount
    }

    return {
        chunks: result,
        totalChars,
        summary: `Smart context: ${result.length} chunks, ${totalChars} chars (${result.filter(c => c.signal === 'changed').length} changed, ${result.filter(c => c.signal === 'imported').length} imports, ${result.filter(c => c.signal === 'importer').length} importers, ${result.filter(c => c.signal === 'test').length} tests)`,
    }
}
