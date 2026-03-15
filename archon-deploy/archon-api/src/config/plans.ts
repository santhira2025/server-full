import Stripe from "stripe"

export interface Plan {
    id: string
    name: string
    tier: string
    monthlyRequests: number
    maxTokensPerRequest: number
    privateRepos: boolean
    priceMonthly: number
    stripePriceId: string | null
}

export const PLANS: Record<string, Plan> = {
    free: {
        id: "free",
        name: "Free",
        tier: "free",
        monthlyRequests: -1,
        maxTokensPerRequest: 8192,
        privateRepos: true,
        priceMonthly: 0,
        stripePriceId: null,
    },
    pro: {
        id: "pro",
        name: "Pro",
        tier: "pro",
        monthlyRequests: 500,
        maxTokensPerRequest: 8192,
        privateRepos: true,
        priceMonthly: 1900,
        stripePriceId: process.env.STRIPE_PRICE_PRO || null,
    },
    team: {
        id: "team",
        name: "Team",
        tier: "pro",
        monthlyRequests: 2000,
        maxTokensPerRequest: 8192,
        privateRepos: true,
        priceMonthly: 4900,
        stripePriceId: process.env.STRIPE_PRICE_TEAM || null,
    },
}

// In-memory cache for auto-bootstrapped Stripe price IDs
const bootstrappedPrices: Record<string, string> = {}

/**
 * Get the Stripe price ID for a plan.
 * If not configured via env vars, auto-creates the Stripe product + price.
 * Only requires STRIPE_SECRET_KEY to be set.
 */
export async function getStripePriceId(planId: string, stripe: Stripe): Promise<string | null> {
    const plan = PLANS[planId]
    if (!plan || plan.priceMonthly === 0) return null

    // 1. Already set via env var
    if (plan.stripePriceId) return plan.stripePriceId

    // 2. Already bootstrapped this session
    if (bootstrappedPrices[planId]) return bootstrappedPrices[planId]

    // 3. Auto-create product + price in Stripe
    try {
        // Check if product already exists (search by metadata)
        const existingProducts = await stripe.products.search({
            query: `metadata["archon_plan"]:"${planId}"`,
        })

        let productId: string

        if (existingProducts.data.length > 0) {
            productId = existingProducts.data[0].id

            // Check for existing active price on this product
            const existingPrices = await stripe.prices.list({
                product: productId,
                active: true,
                type: "recurring",
                limit: 1,
            })
            if (existingPrices.data.length > 0) {
                const priceId = existingPrices.data[0].id
                bootstrappedPrices[planId] = priceId
                console.log(`[Stripe] Reusing existing price ${priceId} for ${planId}`)
                return priceId
            }
        } else {
            // Create new product
            const product = await stripe.products.create({
                name: `Archon ${plan.name}`,
                description: `${plan.monthlyRequests} requests/mo, ${plan.privateRepos ? "private repos" : "public repos only"}`,
                metadata: { archon_plan: planId },
            })
            productId = product.id
            console.log(`[Stripe] Created product ${productId} for ${planId}`)
        }

        // Create recurring price
        const price = await stripe.prices.create({
            product: productId,
            unit_amount: plan.priceMonthly,
            currency: "usd",
            recurring: { interval: "month" },
            metadata: { archon_plan: planId },
        })

        bootstrappedPrices[planId] = price.id
        console.log(`[Stripe] Created price ${price.id} for ${planId} ($${plan.priceMonthly / 100}/mo)`)
        return price.id
    } catch (err: any) {
        console.error(`[Stripe] Failed to bootstrap ${planId}:`, err.message)
        return null
    }
}

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured(): boolean {
    const key = process.env.STRIPE_SECRET_KEY
    return !!key && key !== "sk_test_placeholder" && key.startsWith("sk_")
}
