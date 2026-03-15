import { Hono } from "hono"
import { randomBytes, createHmac } from "crypto"
import { handleGitHubCallback } from "../services/auth.js"

const auth = new Hono()

// Cookie-based state: works across multiple replicas (no shared memory needed).
// State is stored in a short-lived HttpOnly cookie, verified in the callback.
const COOKIE_NAME = "oauth_state"
const STATE_TTL_S = 600 // 10 minutes

function generateState(): string {
    return randomBytes(16).toString("hex")
}

function signState(state: string): string {
    const secret = process.env.JWT_SECRET || "fallback"
    return createHmac("sha256", secret).update(state).digest("hex")
}

auth.get("/github", (c) => {
    const state = generateState()
    const sig = signState(state)
    const cookieVal = `${state}.${sig}`

    const url = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&state=${state}`

    // Set cookie before redirecting
    c.header("Set-Cookie", `${COOKIE_NAME}=${cookieVal}; HttpOnly; SameSite=Lax; Max-Age=${STATE_TTL_S}; Path=/`)
    return c.redirect(url)
})

auth.get("/github/callback", async (c) => {
    const code = c.req.query("code")
    const state = c.req.query("state")

    if (!code) return c.json({ error: "Missing code" }, 400)
    if (!state) return c.json({ error: "Missing state" }, 400)

    // Verify state matches cookie
    const rawCookie = c.req.header("cookie") || ""
    const cookieVal = rawCookie
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${COOKIE_NAME}=`))
        ?.split("=")[1]

    if (!cookieVal) return c.json({ error: "Missing state cookie" }, 400)

    const [cookieState, cookieSig] = cookieVal.split(".")
    if (cookieState !== state || signState(state) !== cookieSig) {
        return c.json({ error: "Invalid state" }, 400)
    }

    // Clear the cookie
    c.header("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`)

    try {
        const token = await handleGitHubCallback(code)
        return c.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/auth/callback?token=${token}`)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

export default auth
