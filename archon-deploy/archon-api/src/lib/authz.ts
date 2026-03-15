import type { Context } from "hono"
import { verifyToken } from "../services/auth.js"
import { db } from "../db/client.js"
import { users } from "../db/schema.js"
import { eq } from "drizzle-orm"
import { getOrSet } from "../services/cache.js"

export interface AuthUser {
    id: string
    orgId: string
    role: string
    githubLogin: string
}

const USER_CACHE_TTL = 300 // 5 minutes

export async function requireAuthUser(c: Context): Promise<AuthUser | null> {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return null
    }

    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)
    if (!payload) {
        return null
    }

    const cacheKey = `authz:user:${payload.userId}`
    return getOrSet<AuthUser | null>(cacheKey, USER_CACHE_TTL, async () => {
        const user = await db.query.users.findFirst({
            where: eq(users.id, payload.userId),
        })
        if (!user?.orgId) return null
        return {
            id: user.id,
            orgId: user.orgId,
            role: user.role || "member",
            githubLogin: user.githubLogin,
        }
    })
}

export function hasMinimumRole(role: string, minimum: "owner" | "admin" | "member" | "viewer"): boolean {
    const rank: Record<string, number> = {
        viewer: 0,
        member: 1,
        admin: 2,
        owner: 3,
    }
    return (rank[role] ?? 0) >= rank[minimum]
}
