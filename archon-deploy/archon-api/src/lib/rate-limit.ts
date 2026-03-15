import { createMiddleware } from "hono/factory"
import type { Context } from "hono"

interface RateLimitOptions {
    windowMs: number
    max: number
    keyFn?: (c: Context) => string
}

interface WindowEntry {
    count: number
    resetAt: number
}

const store = new Map<string, WindowEntry>()

// Periodic cleanup every 60s
const cleanup = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key)
    }
}, 60_000)
cleanup.unref()

function defaultKey(c: Context): string {
    return (
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        c.req.header("x-real-ip") ||
        "unknown"
    )
}

export function rateLimit(opts: RateLimitOptions) {
    const { windowMs, max, keyFn } = opts

    return createMiddleware(async (c, next) => {
        const key = (keyFn ? keyFn(c) : defaultKey(c))
        const now = Date.now()
        let entry = store.get(key)

        if (!entry || now > entry.resetAt) {
            entry = { count: 0, resetAt: now + windowMs }
            store.set(key, entry)
        }

        entry.count++

        const remaining = Math.max(0, max - entry.count)
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000)

        c.header("X-RateLimit-Limit", String(max))
        c.header("X-RateLimit-Remaining", String(remaining))
        c.header("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)))

        if (entry.count > max) {
            c.header("Retry-After", String(retryAfter))
            return c.json({ error: "Too many requests" }, 429)
        }

        await next()
    })
}
