/**
 * Redis cache service with graceful no-op fallback.
 *
 * If REDIS_URL is not set, or if Redis is unreachable, all operations
 * silently return null/undefined — the caller falls through to the live
 * data source.  No errors are ever thrown to callers.
 */

import { Redis } from "ioredis"

let _client: Redis | null = null
let _connectAttempted = false

function getClient(): Redis | null {
    if (!process.env.REDIS_URL) return null
    if (_connectAttempted) return _client

    _connectAttempted = true
    try {
        _client = new Redis(process.env.REDIS_URL, {
            lazyConnect: true,
            maxRetriesPerRequest: 1,
            connectTimeout: 3_000,
            commandTimeout: 2_000,
            enableOfflineQueue: false,  // don't queue commands when disconnected
            retryStrategy: (times: number) => {
                // Back off quickly: 500 ms, 1 s, 2 s — then give up until next getClient()
                if (times > 3) { _connectAttempted = false; return null }
                return Math.min(times * 500, 2_000)
            },
        })

        _client.on("error", () => {
            // Swallow silently — cache is degraded, not fatal
        })
    } catch {
        _client = null
    }

    return _client
}

/** Retrieve a cached value. Returns null on cache miss or any error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const r = getClient()
        if (!r) return null
        const raw = await r.get(key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch {
        return null
    }
}

/** Store a value with an explicit TTL in seconds. Silently no-ops on error. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
        const r = getClient()
        if (!r) return
        await r.set(key, JSON.stringify(value), "EX", ttlSeconds)
    } catch {
        // swallow
    }
}

/** Delete a cache key (e.g. on token revocation). Silently no-ops on error. */
export async function cacheDel(key: string): Promise<void> {
    try {
        const r = getClient()
        if (!r) return
        await r.del(key)
    } catch {
        // swallow
    }
}

/**
 * Convenience: return cached value if present, otherwise call `fn`,
 * cache the result, and return it.
 */
export async function getOrSet<T>(
    key: string,
    ttlSeconds: number,
    fn: () => Promise<T>
): Promise<T> {
    const cached = await cacheGet<T>(key)
    if (cached !== null) return cached

    const fresh = await fn()
    await cacheSet(key, fresh, ttlSeconds)
    return fresh
}
