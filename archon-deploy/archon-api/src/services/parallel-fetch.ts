/**
 * Parallel file fetching utility for GitHub API.
 * Batches concurrent requests to avoid rate limits while maximizing throughput.
 */
import { Octokit } from "@octokit/rest"

export interface FetchResult {
    path: string
    contents: string | null
    error?: string
}

export interface ParallelFetchOptions {
    /** Max concurrent requests per batch (default: 10) */
    batchSize?: number
    /** Max lines per file (default: unlimited) */
    lineCap?: number
    /** Max raw file size in bytes to accept (default: unlimited) */
    maxFileSize?: number
    /** Progress callback: (fetched, total, currentFile) */
    onProgress?: (fetched: number, total: number, currentFile?: string) => void | Promise<void>
}

/**
 * Fetch multiple files from a GitHub repo in parallel batches.
 * One failure doesn't kill the batch — errors are silently skipped.
 */
export async function fetchFilesParallel(
    octokit: Octokit,
    owner: string,
    repo: string,
    ref: string,
    filePaths: string[],
    options: ParallelFetchOptions = {},
): Promise<FetchResult[]> {
    const {
        batchSize = 10,
        lineCap,
        maxFileSize,
        onProgress,
    } = options

    const results: FetchResult[] = []
    let fetched = 0

    for (let i = 0; i < filePaths.length; i += batchSize) {
        const batch = filePaths.slice(i, i + batchSize)

        if (onProgress && i > 0) {
            await onProgress(fetched, filePaths.length, batch[0])
        }

        const batchResults = await Promise.all(
            batch.map(async (filePath): Promise<FetchResult> => {
                try {
                    const { data } = await octokit.rest.repos.getContent({
                        owner, repo, path: filePath, ref,
                    })
                    if ('content' in data && typeof data.content === 'string') {
                        let raw = Buffer.from(data.content, 'base64').toString('utf-8')

                        if (maxFileSize && raw.length > maxFileSize) {
                            return { path: filePath, contents: null, error: 'exceeds maxFileSize' }
                        }

                        if (lineCap) {
                            raw = raw.split('\n').slice(0, lineCap).join('\n')
                        }

                        return { path: filePath, contents: raw }
                    }
                    return { path: filePath, contents: null, error: 'no content field' }
                } catch {
                    return { path: filePath, contents: null, error: 'fetch failed' }
                }
            })
        )

        results.push(...batchResults)
        fetched += batch.length
    }

    if (onProgress) {
        await onProgress(fetched, filePaths.length)
    }

    return results
}
