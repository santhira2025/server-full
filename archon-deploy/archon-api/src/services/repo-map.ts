/**
 * Repo Map Service (Feature 1.1 — Aider-Inspired)
 *
 * Generates a condensed map of the repository showing file structure,
 * function/class signatures, imports, and exports. Injected into every
 * review prompt so the AI understands the full architecture.
 */
import { Octokit } from "@octokit/rest"

// ── Types ────────────────────────────────────────────────────────────

export interface FileEntry {
    path: string
    language: string
    exports: string[]
    imports: string[]
    signatures: string[]
    lineCount: number
}

export interface RepoMap {
    generated: string
    files: FileEntry[]
    importGraph: Record<string, string[]>  // file → [files it imports]
}

// ── Language Detection ───────────────────────────────────────────────

const LANG_MAP: Record<string, string> = {
    '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
    '.py': 'python', '.go': 'go', '.rs': 'rust', '.java': 'java',
    '.rb': 'ruby', '.php': 'php', '.cs': 'csharp', '.cpp': 'cpp',
    '.c': 'c', '.swift': 'swift', '.kt': 'kotlin', '.scala': 'scala',
}

const SOURCE_EXTENSIONS = new Set(Object.keys(LANG_MAP))

const SKIP_DIRS = new Set([
    'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
    'vendor', 'target', '.archon', '.github', 'coverage', '.turbo',
])

function getLanguage(path: string): string {
    const ext = '.' + path.split('.').pop()
    return LANG_MAP[ext] || ''
}

function shouldInclude(path: string): boolean {
    const parts = path.split('/')
    if (parts.some(p => SKIP_DIRS.has(p))) return false
    const lang = getLanguage(path)
    return lang !== ''
}

// ── Regex-Based Extraction ──────────────────────────────────────────

interface ExtractResult {
    exports: string[]
    imports: string[]
    signatures: string[]
}

function extractFromSource(code: string, language: string): ExtractResult {
    const exports: string[] = []
    const imports: string[] = []
    const signatures: string[] = []
    const lines = code.split('\n')

    for (const line of lines) {
        const trimmed = line.trim()

        // TypeScript / JavaScript
        if (language === 'typescript' || language === 'javascript') {
            // Exports
            const exportMatch = trimmed.match(/^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/)
            if (exportMatch) exports.push(exportMatch[1])

            // Imports
            const importMatch = trimmed.match(/^import\s+.*\s+from\s+['"]([^'"]+)['"]/)
            if (importMatch) imports.push(importMatch[1])

            // Function signatures
            const funcMatch = trimmed.match(/^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
            if (funcMatch) signatures.push(`function ${funcMatch[1]}(${funcMatch[2].substring(0, 80)})`)

            const classMatch = trimmed.match(/^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/)
            if (classMatch) signatures.push(`class ${classMatch[1]}${classMatch[2] ? ` extends ${classMatch[2]}` : ''}`)

            const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/)
            if (interfaceMatch) signatures.push(`interface ${interfaceMatch[1]}`)
        }

        // Python
        if (language === 'python') {
            const defMatch = trimmed.match(/^(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)/)
            if (defMatch) {
                signatures.push(`def ${defMatch[1]}(${defMatch[2].substring(0, 80)})`)
                if (!trimmed.startsWith('_')) exports.push(defMatch[1])
            }
            const classMatch = trimmed.match(/^class\s+(\w+)(?:\(([^)]*)\))?/)
            if (classMatch) {
                signatures.push(`class ${classMatch[1]}${classMatch[2] ? `(${classMatch[2]})` : ''}`)
                exports.push(classMatch[1])
            }
            const importMatch = trimmed.match(/^(?:from\s+(\S+)\s+)?import\s+/)
            if (importMatch && importMatch[1]) imports.push(importMatch[1])
        }

        // Go
        if (language === 'go') {
            const funcMatch = trimmed.match(/^func\s+(?:\((\w+)\s+\*?\w+\)\s+)?(\w+)\s*\(([^)]*)\)/)
            if (funcMatch) {
                const name = funcMatch[2]
                signatures.push(`func ${funcMatch[1] ? `(${funcMatch[1]}) ` : ''}${name}(${(funcMatch[3] || '').substring(0, 60)})`)
                if (name[0] === name[0].toUpperCase()) exports.push(name)
            }
            const importMatch = trimmed.match(/^\s*"([^"]+)"/)
            if (importMatch) imports.push(importMatch[1])
        }

        // Java / Kotlin
        if (language === 'java' || language === 'kotlin') {
            const classMatch = trimmed.match(/^(?:public\s+)?(?:abstract\s+)?class\s+(\w+)/)
            if (classMatch) {
                signatures.push(`class ${classMatch[1]}`)
                exports.push(classMatch[1])
            }
            const methodMatch = trimmed.match(/(?:public|protected)\s+(?:static\s+)?(?:\w+)\s+(\w+)\s*\(/)
            if (methodMatch) signatures.push(trimmed.substring(0, 80))
            const importMatch = trimmed.match(/^import\s+(\S+);?/)
            if (importMatch) imports.push(importMatch[1])
        }

        // Rust
        if (language === 'rust') {
            const fnMatch = trimmed.match(/^pub\s+(?:async\s+)?fn\s+(\w+)/)
            if (fnMatch) {
                signatures.push(trimmed.substring(0, 80))
                exports.push(fnMatch[1])
            }
            const structMatch = trimmed.match(/^pub\s+struct\s+(\w+)/)
            if (structMatch) {
                signatures.push(`pub struct ${structMatch[1]}`)
                exports.push(structMatch[1])
            }
            const useMatch = trimmed.match(/^use\s+(\S+);?/)
            if (useMatch) imports.push(useMatch[1])
        }
    }

    return { exports, imports, signatures }
}

// ── Build Import Graph ──────────────────────────────────────────────

function resolveImportPath(fromFile: string, importPath: string): string | null {
    // Skip external packages
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) return null

    const fromDir = fromFile.split('/').slice(0, -1).join('/')
    const parts = importPath.split('/')
    let resolved = fromDir.split('/')

    for (const part of parts) {
        if (part === '.') continue
        if (part === '..') { resolved.pop(); continue }
        resolved.push(part)
    }

    return resolved.join('/')
}

function buildImportGraph(files: FileEntry[]): Record<string, string[]> {
    const fileSet = new Set(files.map(f => f.path))
    const graph: Record<string, string[]> = {}

    for (const file of files) {
        const resolved: string[] = []
        for (const imp of file.imports) {
            const path = resolveImportPath(file.path, imp)
            if (!path) continue
            // Try with extensions
            for (const ext of ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.js']) {
                if (fileSet.has(path + ext)) {
                    resolved.push(path + ext)
                    break
                }
            }
        }
        if (resolved.length > 0) {
            graph[file.path] = resolved
        }
    }

    return graph
}

// ── Main: Generate Repo Map ─────────────────────────────────────────

export async function generateRepoMap(
    octokit: Octokit, owner: string, repo: string
): Promise<RepoMap> {
    // 1. Fetch file tree
    const { data: repoData } = await octokit.rest.repos.get({ owner, repo })
    let tree: string[] = []
    try {
        const { data: treeData } = await octokit.rest.git.getTree({
            owner, repo, tree_sha: repoData.default_branch, recursive: 'true',
        })
        tree = treeData.tree
            .filter((t: any) => t.type === 'blob')
            .map((t: any) => t.path as string)
    } catch { /* empty repo */ }

    // 2. Filter to source files
    const sourceFiles = tree.filter(shouldInclude).slice(0, 500)
    console.log(`Repo map: scanning ${sourceFiles.length} source files out of ${tree.length} total`)

    // 3. Extract signatures from each file
    const files: FileEntry[] = []

    for (const filePath of sourceFiles) {
        try {
            const { data } = await octokit.rest.repos.getContent({
                owner, repo, path: filePath, ref: repoData.default_branch,
            })
            if (!('content' in data) || !data.content) continue

            const content = Buffer.from(data.content, 'base64').toString('utf-8')
            const language = getLanguage(filePath)
            const lineCount = content.split('\n').length

            // Only extract from first 500 lines for performance
            const truncated = content.split('\n').slice(0, 500).join('\n')
            const extracted = extractFromSource(truncated, language)

            files.push({
                path: filePath,
                language,
                exports: extracted.exports.slice(0, 20),
                imports: extracted.imports.slice(0, 30),
                signatures: extracted.signatures.slice(0, 20),
                lineCount,
            })
        } catch { /* binary, too large, etc */ }
    }

    // 4. Build import graph
    const importGraph = buildImportGraph(files)

    return {
        generated: new Date().toISOString(),
        files,
        importGraph,
    }
}

// ── Load Cached Repo Map ────────────────────────────────────────────

export async function loadRepoMap(
    octokit: Octokit, owner: string, repo: string
): Promise<RepoMap | null> {
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner, repo, path: '.archon/repo-map.json',
        })
        if ('content' in data && data.content) {
            const json = Buffer.from(data.content, 'base64').toString('utf-8')
            return JSON.parse(json) as RepoMap
        }
    } catch { /* doesn't exist */ }
    return null
}

// ── Save Repo Map ───────────────────────────────────────────────────

export async function saveRepoMap(
    octokit: Octokit, owner: string, repo: string, repoMap: RepoMap
): Promise<void> {
    let sha: string | undefined
    try {
        const { data } = await octokit.rest.repos.getContent({
            owner, repo, path: '.archon/repo-map.json',
        })
        if ('sha' in data) sha = data.sha
    } catch { /* new file */ }

    await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo,
        path: '.archon/repo-map.json',
        message: 'chore: update Archon repo map',
        content: Buffer.from(JSON.stringify(repoMap, null, 2)).toString('base64'),
        sha,
    })
}

// ── Get Related Files (for review context) ──────────────────────────

export function getRelatedFiles(
    repoMap: RepoMap, changedFiles: string[]
): { imports: string[]; importers: string[] } {
    const changedSet = new Set(changedFiles)
    const imports = new Set<string>()
    const importers = new Set<string>()

    for (const file of changedFiles) {
        // Files this file imports
        const deps = repoMap.importGraph[file] || []
        for (const dep of deps) {
            if (!changedSet.has(dep)) imports.add(dep)
        }
    }

    // Files that import any changed file
    for (const [source, deps] of Object.entries(repoMap.importGraph)) {
        if (changedSet.has(source)) continue
        for (const dep of deps) {
            if (changedSet.has(dep)) {
                importers.add(source)
                break
            }
        }
    }

    return {
        imports: Array.from(imports),
        importers: Array.from(importers),
    }
}

// ── Build Prompt Context ────────────────────────────────────────────

export function buildRepoMapContext(
    repoMap: RepoMap, changedFiles: string[]
): string {
    if (!repoMap || repoMap.files.length === 0) return ''

    const { imports: importedFiles, importers } = getRelatedFiles(repoMap, changedFiles)
    const changedSet = new Set(changedFiles)

    let context = '\n\n=== REPOSITORY MAP (architecture context) ===\n'

    // Changed files signatures
    const changedEntries = repoMap.files.filter(f => changedSet.has(f.path))
    if (changedEntries.length > 0) {
        context += '\nChanged file signatures:\n'
        for (const f of changedEntries) {
            if (f.signatures.length > 0) {
                context += `  ${f.path}: ${f.signatures.join(', ')}\n`
            }
        }
    }

    // Imported file signatures (1 hop)
    const importEntries = repoMap.files.filter(f => importedFiles.includes(f.path))
    if (importEntries.length > 0) {
        context += '\nImported dependencies (check for breaking changes):\n'
        for (const f of importEntries.slice(0, 10)) {
            context += `  ${f.path}: ${f.signatures.slice(0, 5).join(', ')}\n`
        }
    }

    // Files that import changed files (check for downstream impact)
    const importerEntries = repoMap.files.filter(f => importers.includes(f.path))
    if (importerEntries.length > 0) {
        context += '\nFiles that depend on changed code (downstream impact):\n'
        for (const f of importerEntries.slice(0, 10)) {
            context += `  ${f.path}\n`
        }
    }

    // Overall structure summary
    const langCounts: Record<string, number> = {}
    for (const f of repoMap.files) {
        langCounts[f.language] = (langCounts[f.language] || 0) + 1
    }
    context += `\nProject: ${repoMap.files.length} source files (${Object.entries(langCounts).map(([l, c]) => `${c} ${l}`).join(', ')})\n`

    return context
}
