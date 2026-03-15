import { Hono } from "hono"
import Stripe from "stripe"
import { z } from "zod"
import { db } from "../db/client.js"
import { organizations, usageRecords, users } from "../db/schema.js"
import { eq, and, gt, sql } from "drizzle-orm"
import { PLANS, getStripePriceId, isStripeConfigured } from "../config/plans.js"
import { verifyToken } from "../services/auth.js"

const checkoutSchema = z.object({
    planId: z.string().min(1),
})

type Variables = { userId: string }

const billing = new Hono<{ Variables: Variables }>()
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173"

function getStripe(): Stripe | null {
    if (!isStripeConfigured()) return null
    return new Stripe(process.env.STRIPE_SECRET_KEY!)
}

// Auth middleware for billing routes (except webhook)
async function requireAuth(c: any, next: any) {
    const authHeader = c.req.header("Authorization")
    if (!authHeader?.startsWith("Bearer ")) {
        return c.json({ error: "Unauthorized" }, 401)
    }
    const token = authHeader.split(" ")[1]
    const payload = verifyToken(token)
    if (!payload) return c.json({ error: "Invalid token" }, 401)

    c.set("userId", payload.userId)
    await next()
}

// ── GET /billing/status ──────────────────────────────────────────
// Returns current plan, usage, subscription info, and stripe config status
billing.get("/status", requireAuth, async (c) => {
    const userId = c.get("userId") as string

    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org) return c.json({ error: "Organization not found" }, 404)

    const plan = PLANS[org.plan || "free"] || PLANS.free

    // Count usage this month
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const usageResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(usageRecords)
        .where(
            and(
                eq(usageRecords.orgId, org.id),
                gt(usageRecords.createdAt, startOfMonth)
            )
        )

    const usedThisMonth = Number(usageResult[0]?.count || 0)

    // Fetch subscription details from Stripe if configured
    let subscription: any = null
    if (org.stripeSubscriptionId && isStripeConfigured()) {
        try {
            const stripe = getStripe()!
            const sub = await stripe.subscriptions.retrieve(org.stripeSubscriptionId) as any
            subscription = {
                id: sub.id,
                status: sub.status,
                currentPeriodEnd: sub.current_period_end,
                cancelAtPeriodEnd: sub.cancel_at_period_end,
            }
        } catch {
            // Subscription may have been deleted externally
            subscription = null
        }
    }

    return c.json({
        plan: {
            id: plan.id,
            name: plan.name,
            monthlyRequests: plan.monthlyRequests,
            priceMonthly: plan.priceMonthly,
            privateRepos: plan.privateRepos,
        },
        usage: {
            used: usedThisMonth,
            limit: plan.monthlyRequests,
            percentage: plan.monthlyRequests > 0
                ? Math.round((usedThisMonth / plan.monthlyRequests) * 100)
                : 0,
        },
        subscription,
        stripeConfigured: isStripeConfigured(),
        orgId: org.id,
    })
})

// ── POST /billing/checkout ───────────────────────────────────────
// Creates a Stripe checkout session. Auto-bootstraps prices if needed.
billing.post("/checkout", requireAuth, async (c) => {
    const userId = c.get("userId") as string
    const raw = await c.req.json()
    const parsed = checkoutSchema.safeParse(raw)
    if (!parsed.success) {
        return c.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, 400)
    }
    const { planId } = parsed.data

    const plan = PLANS[planId]
    if (!plan) return c.json({ error: "Invalid plan" }, 400)
    if (plan.priceMonthly === 0) return c.json({ error: "Free plan does not require checkout" }, 400)

    if (!isStripeConfigured()) {
        return c.json({
            error: "Stripe is not configured. Add your STRIPE_SECRET_KEY to .env to enable billing.",
            setupRequired: true,
        }, 503)
    }

    const stripe = getStripe()!

    // Look up user's org
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org) return c.json({ error: "Organization not found" }, 404)

    // Auto-bootstrap: get or create Stripe price ID
    const priceId = await getStripePriceId(planId, stripe)
    if (!priceId) {
        return c.json({
            error: "Failed to configure Stripe prices. Check your Stripe API key.",
        }, 500)
    }

    try {
        const sessionParams: Stripe.Checkout.SessionCreateParams = {
            mode: "subscription",
            payment_method_types: ["card"],
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${FRONTEND_URL}/billing?success=true`,
            cancel_url: `${FRONTEND_URL}/billing?canceled=true`,
            metadata: { orgId: org.id, planId },
        }

        // Reuse existing Stripe customer if we have one
        if (org.stripeCustomerId) {
            sessionParams.customer = org.stripeCustomerId
        } else {
            sessionParams.customer_email = user.email || undefined
        }

        const session = await stripe.checkout.sessions.create(sessionParams)
        return c.json({ url: session.url })
    } catch (err: any) {
        console.error("[Stripe] Checkout error:", err.message)
        return c.json({ error: err.message }, 500)
    }
})

// ── POST /billing/portal ─────────────────────────────────────────
// Creates a Stripe Customer Portal session for managing subscriptions
billing.post("/portal", requireAuth, async (c) => {
    if (!isStripeConfigured()) {
        return c.json({ error: "Stripe is not configured" }, 503)
    }

    const userId = c.get("userId") as string
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org?.stripeCustomerId) {
        return c.json({ error: "No active subscription found" }, 400)
    }

    try {
        const stripe = getStripe()!
        const session = await stripe.billingPortal.sessions.create({
            customer: org.stripeCustomerId,
            return_url: `${FRONTEND_URL}/billing`,
        })
        return c.json({ url: session.url })
    } catch (err: any) {
        console.error("[Stripe] Portal error:", err.message)
        return c.json({ error: err.message }, 500)
    }
})

// ── POST /billing/cancel ─────────────────────────────────────────
// Cancels subscription at period end
billing.post("/cancel", requireAuth, async (c) => {
    if (!isStripeConfigured()) {
        return c.json({ error: "Stripe is not configured" }, 503)
    }

    const userId = c.get("userId") as string
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org?.stripeSubscriptionId) {
        return c.json({ error: "No active subscription" }, 400)
    }

    try {
        const stripe = getStripe()!
        await stripe.subscriptions.update(org.stripeSubscriptionId, {
            cancel_at_period_end: true,
        })
        return c.json({ success: true, message: "Subscription will cancel at period end" })
    } catch (err: any) {
        console.error("[Stripe] Cancel error:", err.message)
        return c.json({ error: err.message }, 500)
    }
})

// ── POST /billing/reactivate ─────────────────────────────────────
// Reactivates a subscription that was set to cancel at period end
billing.post("/reactivate", requireAuth, async (c) => {
    if (!isStripeConfigured()) {
        return c.json({ error: "Stripe is not configured" }, 503)
    }

    const userId = c.get("userId") as string
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
    })
    if (!user?.orgId) return c.json({ error: "No organization" }, 404)

    const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, user.orgId),
    })
    if (!org?.stripeSubscriptionId) {
        return c.json({ error: "No subscription found" }, 400)
    }

    try {
        const stripe = getStripe()!
        await stripe.subscriptions.update(org.stripeSubscriptionId, {
            cancel_at_period_end: false,
        })
        return c.json({ success: true, message: "Subscription reactivated" })
    } catch (err: any) {
        console.error("[Stripe] Reactivate error:", err.message)
        return c.json({ error: err.message }, 500)
    }
})

// ── POST /billing/webhook ────────────────────────────────────────
// Stripe webhook handler (no auth middleware — Stripe signs these)
billing.post("/webhook", async (c) => {
    if (!isStripeConfigured()) {
        return c.json({ error: "Stripe not configured" }, 503)
    }

    const stripe = getStripe()!
    const sig = c.req.header("stripe-signature")
    const body = await c.req.text()

    let event: Stripe.Event

    if (process.env.STRIPE_WEBHOOK_SECRET) {
        try {
            event = stripe.webhooks.constructEvent(
                body,
                sig || "",
                process.env.STRIPE_WEBHOOK_SECRET
            )
        } catch (err: any) {
            console.error("[Stripe] Webhook signature verification failed:", err.message)
            return c.json({ error: `Webhook Error: ${err.message}` }, 400)
        }
    } else {
        // Dev mode: parse without signature verification
        try {
            event = JSON.parse(body) as Stripe.Event
            console.warn("[Stripe] Webhook received without signature verification (no STRIPE_WEBHOOK_SECRET)")
        } catch {
            return c.json({ error: "Invalid JSON body" }, 400)
        }
    }

    console.log(`[Stripe] Webhook event: ${event.type}`)

    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session
            const orgId = session.metadata?.orgId
            const planId = session.metadata?.planId

            if (orgId && planId) {
                await db.update(organizations)
                    .set({
                        plan: planId,
                        stripeCustomerId: session.customer as string,
                        stripeSubscriptionId: session.subscription as string,
                        updatedAt: new Date(),
                    })
                    .where(eq(organizations.id, orgId))
                console.log(`[Stripe] Org ${orgId} upgraded to ${planId}`)
            }
            break
        }

        case "customer.subscription.updated": {
            const subscription = event.data.object as Stripe.Subscription
            const org = await db.query.organizations.findFirst({
                where: eq(organizations.stripeSubscriptionId, subscription.id),
            })
            if (org) {
                // If subscription becomes past_due or canceled, downgrade to free
                if (["canceled", "unpaid"].includes(subscription.status)) {
                    await db.update(organizations)
                        .set({ plan: "free", updatedAt: new Date() })
                        .where(eq(organizations.id, org.id))
                    console.log(`[Stripe] Org ${org.id} downgraded to free (${subscription.status})`)
                }
            }
            break
        }

        case "customer.subscription.deleted": {
            const subscription = event.data.object as Stripe.Subscription
            await db.update(organizations)
                .set({
                    plan: "free",
                    stripeSubscriptionId: null,
                    updatedAt: new Date(),
                })
                .where(eq(organizations.stripeSubscriptionId, subscription.id))
            console.log(`[Stripe] Subscription ${subscription.id} deleted — org downgraded to free`)
            break
        }

        case "invoice.payment_failed": {
            const invoice = event.data.object as Stripe.Invoice
            console.warn(`[Stripe] Payment failed for invoice ${invoice.id}, customer ${invoice.customer}`)
            break
        }
    }

    return c.json({ received: true })
})

export default billing
