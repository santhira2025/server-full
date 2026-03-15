/**
 * JSON parsing utilities for LLM output.
 * Handles common issues: markdown fences, literal newlines in strings, truncated JSON.
 */

/**
 * Escape literal newlines inside JSON string values.
 * LLMs often output JSON with real newlines in strings (e.g., code content)
 * instead of \\n, which makes JSON.parse fail.
 */
export function escapeNewlinesInStrings(text: string): string {
    let result = ''
    let inString = false
    let escaped = false

    for (let i = 0; i < text.length; i++) {
        const ch = text[i]

        if (escaped) {
            result += ch
            escaped = false
            continue
        }

        if (ch === '\\') {
            result += ch
            escaped = true
            continue
        }

        if (ch === '"') {
            inString = !inString
            result += ch
            continue
        }

        if (inString && ch === '\n') {
            result += '\\n'
            continue
        }
        if (inString && ch === '\r') {
            continue // skip carriage returns
        }
        if (inString && ch === '\t') {
            result += '\\t'
            continue
        }

        result += ch
    }

    return result
}

export function parseJSON(text: string): any {
    let cleaned = text.trim()
    // Strip markdown code fences (opening and closing)
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?\s*```\s*$/, '')
    // Try to extract JSON object even if response has extra text around it
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
        cleaned = jsonMatch[0]
    }

    // First attempt: direct parse
    try {
        return JSON.parse(cleaned)
    } catch { /* continue to fixes */ }

    // Second attempt: fix literal newlines in string values (common LLM issue)
    try {
        const escaped = escapeNewlinesInStrings(cleaned)
        return JSON.parse(escaped)
    } catch { /* continue to fixes */ }

    // Third attempt: fix truncated JSON (missing closing braces)
    let fixed = escapeNewlinesInStrings(cleaned)
    const openBraces = (fixed.match(/\{/g) || []).length
    const closeBraces = (fixed.match(/\}/g) || []).length
    if (openBraces > closeBraces) {
        fixed = fixed.replace(/,\s*$/, '') // remove trailing comma
        fixed = fixed.replace(/,\s*"[^"]*$/, '') // remove incomplete string key
        for (let i = 0; i < openBraces - closeBraces; i++) {
            const openBrackets = (fixed.match(/\[/g) || []).length
            const closeBrackets = (fixed.match(/\]/g) || []).length
            if (openBrackets > closeBrackets) fixed += ']'
            fixed += '}'
        }
    }
    try { return JSON.parse(fixed) } catch { return {} }
}
