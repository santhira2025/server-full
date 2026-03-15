/**
 * AI provider API client with retry logic and prompt truncation.
 */

/** Transient HTTP status codes worth retrying */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504])

export async function callAI(
    systemPrompt: string, userContent: string,
    provider: string, apiKey: string, model: string, maxTokens = 4096
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const MAX_ATTEMPTS = 3
    const BACKOFF_MS = [1000, 2000] // delays between retries

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            if (provider === 'anthropic') {
                return await callAnthropic(systemPrompt, userContent, apiKey, model, maxTokens)
            }
            return await callOpenAICompatible(systemPrompt, userContent, provider, apiKey, model, maxTokens)
        } catch (err: any) {
            const status = extractHttpStatus(err)
            const isTransient = status !== null && RETRYABLE_STATUSES.has(status)

            if (!isTransient || attempt === MAX_ATTEMPTS) {
                throw err
            }

            const delay = BACKOFF_MS[attempt - 1] || 2000
            console.warn(`callAI attempt ${attempt} failed (status ${status}), retrying in ${delay}ms...`)
            await new Promise(r => setTimeout(r, delay))
        }
    }
    throw new Error('callAI: unreachable') // satisfies TS
}

/** Extract HTTP status from API error message like "Groq API error 429: ..." */
function extractHttpStatus(err: any): number | null {
    const msg = err?.message || ''
    const match = msg.match(/error (\d{3})/)
    return match ? parseInt(match[1], 10) : null
}

/** Truncate prompt content with a warning log when truncation occurs */
export function truncatePrompt(content: string, maxChars: number, label: string): string {
    if (content.length <= maxChars) return content
    console.warn(`[truncatePrompt] ${label}: ${content.length} chars → ${maxChars} chars`)
    return content.substring(0, maxChars) + '\n\n[... truncated for token limits ...]'
}

async function callAnthropic(
    systemPrompt: string, userContent: string, apiKey: string, model: string, maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model, max_tokens: maxTokens,
            system: systemPrompt,
            messages: [{ role: 'user', content: userContent }],
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`Anthropic API error ${response.status}: ${errText}`)
    }

    const data = await response.json() as any
    return {
        text: data.content.map((c: any) => c.text).join(''),
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
    }
}

async function callOpenAICompatible(
    systemPrompt: string, userContent: string,
    provider: string, apiKey: string, model: string, maxTokens: number
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const baseUrls: Record<string, string> = {
        groq: 'https://api.groq.com/openai/v1',
        openai: 'https://api.openai.com/v1',
        openrouter: 'https://openrouter.ai/api/v1',
    }
    const baseUrl = baseUrls[provider] || baseUrls.groq

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model, max_tokens: maxTokens,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userContent },
            ],
            temperature: 0.1,
        }),
    })

    if (!response.ok) {
        const errText = await response.text()
        throw new Error(`${provider} API error ${response.status}: ${errText}`)
    }

    const data = await response.json() as any
    return {
        text: data.choices?.[0]?.message?.content || '',
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
    }
}
