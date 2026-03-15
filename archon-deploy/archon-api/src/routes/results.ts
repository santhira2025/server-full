import { Hono } from "hono"
import { db } from "../db/client.js"
import { reviewResults, eventLogs, usageRecords } from "../db/schema.js"

const results = new Hono()

// POST / - Receive results from GitHub Action callback
results.post("/", async (c) => {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401)
    }

    // Decode the archon_token (base64 encoded JSON with orgId)
    const token = authHeader.split(" ")[1]
    let orgId: string
    try {
        const decoded = JSON.parse(Buffer.from(token, 'base64').toString())
        orgId = decoded.orgId?.toString()
        if (!orgId) throw new Error("Missing orgId")
    } catch {
        return c.json({ error: "Invalid token" }, 401)
    }

    const body = await c.req.json()
    const { repo, issueNumber, actionType, result } = body

    // Store the review result
    await db.insert(reviewResults).values({
        id: crypto.randomUUID(),
        orgId,
        repo,
        issueNumber,
        actionType,
        verdict: result.overallVerdict || null,
        summary: result.summary,
        inlineCommentsCount: result.inlineComments?.length || 0,
        securityIssuesCount: result.securityIssues?.length || 0,
        filesReviewed: result.stats?.filesReviewed || 0,
        inputTokens: result.stats?.inputTokens || result.inputTokens || 0,
        outputTokens: result.stats?.outputTokens || result.outputTokens || 0,
        resultData: result,
        status: 'completed',
        completedAt: new Date(),
    })

    // Log the completion event
    await db.insert(eventLogs).values({
        id: crypto.randomUUID(),
        orgId,
        repo,
        eventType: `${actionType}_completed`,
        issueNumber,
        status: 'completed',
        message: `${actionType} completed: ${result.summary?.substring(0, 200) || 'No summary'}`,
    })

    // Record usage with actual token counts
    if (result.stats?.inputTokens || result.inputTokens) {
        await db.insert(usageRecords).values({
            id: crypto.randomUUID(),
            orgId,
            userId: orgId, // action-triggered usage is attributed to org
            repo,
            model: result.model || 'claude-sonnet-4-20250514',
            inputTokens: result.stats?.inputTokens || result.inputTokens || 0,
            outputTokens: result.stats?.outputTokens || result.outputTokens || 0,
        })
    }

    return c.json({ ok: true })
})

export default results
