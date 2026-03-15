import { Octokit } from "@octokit/rest"
import { createAppAuth } from "@octokit/auth-app"
import { cacheGet, cacheSet } from "./cache.js"

/**
 * Normalizes a PEM private key that may have literal \n or surrounding quotes.
 */
function normalizePrivateKey(key: string): string {
    let k = key.trim()
    // Strip surrounding quotes
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
        k = k.slice(1, -1)
    }
    // Replace literal \n with real newlines
    k = k.replace(/\\n/g, "\n")
    return k
}

// GitHub installation tokens expire after 1 hour — cache for 55 min to be safe
const TOKEN_TTL = 55 * 60

/**
 * Gets an installation-specific access token for the GitHub App.
 * Tokens are cached in Redis for 55 minutes (GitHub TTL is 60 min).
 */
export async function getInstallationToken(installationId: number): Promise<string> {
    const cacheKey = `gh:token:${installationId}`

    const cached = await cacheGet<string>(cacheKey)
    if (cached) return cached

    const auth = createAppAuth({
        appId: process.env.GITHUB_APP_ID as string,
        privateKey: normalizePrivateKey(process.env.GITHUB_APP_PRIVATE_KEY as string),
        clientId: process.env.GITHUB_CLIENT_ID as string,
        clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
    })

    const installationAuthentication = await auth({
        type: "installation",
        installationId,
    })

    const token = installationAuthentication.token
    await cacheSet(cacheKey, token, TOKEN_TTL)
    return token
}

/**
 * Posts a comment to an issue or pull request.
 */
export async function postComment(token: string, payload: any, body: string) {
    const octokit = new Octokit({ auth: token })
    const { owner, name: repo } = payload.repository
    const issue_number = payload.issue ? payload.issue.number : payload.pull_request.number

    const { data } = await octokit.issues.createComment({
        owner: owner.login,
        repo,
        issue_number,
        body,
    })

    return data.id
}

/**
 * Updates an existing comment.
 */
export async function updateComment(token: string, payload: any, commentId: number, body: string) {
    const octokit = new Octokit({ auth: token })
    const { owner, name: repo } = payload.repository

    await octokit.issues.updateComment({
        owner: owner.login,
        repo,
        comment_id: commentId,
        body,
    })
}
