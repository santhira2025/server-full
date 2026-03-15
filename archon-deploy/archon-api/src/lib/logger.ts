/**
 * Structured logger (Pino).
 *
 * Usage:
 *   import { logger } from "../lib/logger.js"
 *   logger.info({ userId, repoId }, "Review started")
 *   logger.error({ err }, "Webhook processing failed")
 */

import pino from "pino"

const isDev = process.env.NODE_ENV !== "production"

export const logger = pino({
    level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
    // Pretty-print in dev, raw JSON in production (for log aggregators)
    ...(isDev
        ? {
              transport: {
                  target: "pino-pretty",
                  options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
              },
          }
        : {}),
    base: { service: "archon-api", env: process.env.NODE_ENV || "development" },
    // Redact secrets from logs — camelCase and snake_case variants
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "*.token",
            "*.password",
            "*.secret",
            "*.privateKey",
            "*.private_key",
            "*.apiKey",
            "*.api_key",
            "*.accessToken",
            "*.access_token",
            "*.clientSecret",
            "*.client_secret",
        ],
        censor: "[REDACTED]",
    },
})

/**
 * Hono middleware: log every request with method, path, status, and duration.
 *
 * Usage in index.ts:
 *   import { requestLogger } from "./lib/logger.js"
 *   app.use("*", requestLogger())
 */
export function requestLogger() {
    return async function requestLoggerMiddleware(
        c: import("hono").Context,
        next: () => Promise<void>
    ) {
        const start = Date.now()
        const { method, path } = c.req
        const reqId = c.req.header("x-request-id") || crypto.randomUUID()
        c.res.headers.set("x-request-id", reqId)

        await next()

        const ms = Date.now() - start
        const status = c.res.status
        const logFn = status >= 500 ? logger.error.bind(logger)
            : status >= 400 ? logger.warn.bind(logger)
            : logger.info.bind(logger)

        logFn({ reqId, method, path, status, ms }, `${method} ${path} ${status} ${ms}ms`)
    }
}
