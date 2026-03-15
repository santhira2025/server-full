export interface ModelConfig {
    provider: string
    modelId: string
    apiKey: string
    maxTokens: number
    tpmLimit: number
}

// ── Groq model definitions ────────────────────────────────────────────
// Primary: kimi-k2-instruct  — best quality for code review, security, resolve
// Fast:    llama-3.1-8b-instant — cheap/fast for triage, audit, intent checks

const GROQ_PRIMARY: ModelConfig = {
    provider: "groq",
    modelId: "moonshotai/kimi-k2-instruct",
    apiKey: process.env.GROQ_API_KEY || "",
    maxTokens: 16384,
    tpmLimit: 200000,
}

const GROQ_FAST: ModelConfig = {
    provider: "groq",
    modelId: "llama-3.1-8b-instant",
    apiKey: process.env.GROQ_API_KEY || "",
    maxTokens: 4096,
    tpmLimit: 500000,
}

// ── Plan-based primary model routing ────────────────────────────────
const MODEL_TIERS: Record<string, ModelConfig> = {
    free: GROQ_PRIMARY,
    pro: GROQ_PRIMARY,
    team: GROQ_PRIMARY,
    enterprise: GROQ_PRIMARY,
}

/**
 * Route to the primary (quality-critical) model for this billing tier.
 * Use for: main review, security analysis, resolve/fix generation, reports.
 */
export function routeToModel(tier: string = "free"): ModelConfig {
    return MODEL_TIERS[tier] || GROQ_PRIMARY
}

/**
 * Route to the fast/cheap model for lightweight AI passes.
 * Use for: triage, self-check, AI audit, intent validation.
 */
export function routeToCheapModel(tier: string = "free"): ModelConfig {
    if (process.env.GROQ_API_KEY) {
        return GROQ_FAST
    }
    return routeToModel(tier)
}
