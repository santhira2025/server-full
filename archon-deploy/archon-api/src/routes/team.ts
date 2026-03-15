import { Hono } from "hono"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "../db/client.js"
import { users } from "../db/schema.js"
import { hasMinimumRole, requireAuthUser, type AuthUser } from "../lib/authz.js"

const inviteSchema = z.object({
    githubLogin: z.string().regex(/^[a-zA-Z0-9-]+$/, "Invalid GitHub login format"),
    email: z.string().email().optional(),
})

const roleSchema = z.object({
    role: z.enum(["owner", "admin", "member", "viewer"]),
})

const team = new Hono<{ Variables: { authUser: AuthUser } }>()

team.use("*", async (c, next) => {
    const user = await requireAuthUser(c)
    if (!user) return c.json({ error: "Unauthorized" }, 401)
    c.set("authUser", user)
    await next()
})

team.get("/members", async (c) => {
    const authUser = c.get("authUser") as { orgId: string }
    const members = await db.query.users.findMany({
        where: eq(users.orgId, authUser.orgId),
    })
    return c.json({ members })
})

team.post("/invite", async (c) => {
    const authUser = c.get("authUser") as { id: string; orgId: string; role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const raw = await c.req.json()
    const parsed = inviteSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const { githubLogin, email } = parsed.data

    const existing = await db.query.users.findFirst({
        where: and(eq(users.orgId, authUser.orgId), eq(users.githubLogin, githubLogin)),
    })
    if (existing) {
        return c.json({ member: existing, invited: false })
    }

    const memberId = `invite:${authUser.orgId}:${githubLogin}`
    await db.insert(users).values({
        id: memberId,
        githubLogin,
        email: email || null,
        orgId: authUser.orgId,
        role: "member",
    })

    const member = await db.query.users.findFirst({
        where: eq(users.id, memberId),
    })
    return c.json({ member, invited: true })
})

team.put("/members/:id/role", async (c) => {
    const authUser = c.get("authUser") as { role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const memberId = c.req.param("id")
    const raw = await c.req.json().catch(() => null)
    const parsed = roleSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const { role } = parsed.data

    await db.update(users).set({ role }).where(eq(users.id, memberId))
    return c.json({ ok: true, role })
})

team.delete("/members/:id", async (c) => {
    const authUser = c.get("authUser") as { role: string }
    if (!hasMinimumRole(authUser.role, "admin")) {
        return c.json({ error: "Forbidden" }, 403)
    }

    const memberId = c.req.param("id")
    await db.delete(users).where(eq(users.id, memberId))
    return c.json({ ok: true })
})

export default team
