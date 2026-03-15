import "dotenv/config"
import { serve } from "@hono/node-server"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { secureHeaders } from "hono/secure-headers"
import { pool } from "./db/client.js"
import { rateLimit } from "./lib/rate-limit.js"
import { logger, requestLogger } from "./lib/logger.js"
import { alertError } from "./lib/alerting.js"
import { startScheduler } from "./services/scheduler.js"
import webhook from "./routes/webhook.js"
import auth from "./routes/auth.js"
import billing from "./routes/billing.js"
import dashboard from "./routes/dashboard.js"
import reposRoute from "./routes/repos.js"
import resultsRoute from "./routes/results.js"
import events from "./routes/events.js"
import coaching from "./routes/coaching.js"
import team from "./routes/team.js"
import integrationWebhooks from "./routes/integration-webhooks.js"
import apiV1 from "./routes/api-v1.js"
import admin from "./routes/admin.js"
import tasksRoute from "./routes/tasks.js"
import sse from "./routes/sse.js"
import analytics from "./routes/analytics.js"
import reportsRoute from "./routes/reports.js"

// ── Startup env validation ───────────────────────────────────────────
const REQUIRED_ENV = [
  "DATABASE_URL",
  "JWT_SECRET",
  "GITHUB_APP_ID",
  "GITHUB_WEBHOOK_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
] as const

const missing = REQUIRED_ENV.filter((k) => !process.env[k])
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(", ")}`)
  process.exit(1)
}

const app = new Hono()

// ── Security headers (first) ────────────────────────────────────────
app.use("*", secureHeaders())

// ── Request logging (Pino — JSON in prod, pretty in dev) ────────────
app.use("*", requestLogger())

// ── CORS ────────────────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || "http://localhost:5173",
  ...(process.env.EXTRA_ORIGINS ? process.env.EXTRA_ORIGINS.split(",").map((o) => o.trim()) : []),
]

app.use("*", cors({
  origin: (origin) => allowedOrigins.includes(origin) ? origin : "",
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
  credentials: true,
}))

// ── Rate limiting ───────────────────────────────────────────────────
app.use("/webhook/github/*", rateLimit({ windowMs: 60_000, max: 200 }))
app.use("/api/auth/*", rateLimit({ windowMs: 60_000, max: 20 }))
app.use("/api/*", rateLimit({
  windowMs: 60_000,
  max: 300,
  keyFn: (c) =>
    c.req.header("authorization")?.split(" ")[1] ||
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown",
}))

// ── Global error handler ────────────────────────────────────────────
app.onError((err, c) => {
  const status = "status" in err ? (err as any).status : 500
  if (status >= 500) {
    logger.error({ err, method: c.req.method, path: c.req.path }, "Unhandled server error")
    alertError("Unhandled server error", err, { method: c.req.method, path: c.req.path, status })
  } else {
    logger.warn({ method: c.req.method, path: c.req.path, status, msg: err.message }, "Request error")
  }
  return c.json(
    { error: status >= 500 ? "Internal server error" : err.message },
    status,
  )
})

// ── Health check ────────────────────────────────────────────────────
const startedAt = Date.now()

app.get("/", (c) => c.text("Archon API is running!"))

app.get("/api/health", async (c) => {
  let dbOk = false
  let dbLatencyMs = -1
  try {
    const t0 = Date.now()
    await pool.query("SELECT 1")
    dbLatencyMs = Date.now() - t0
    dbOk = true
  } catch {
    // db unreachable
  }
  const status = dbOk ? "healthy" : "degraded"
  return c.json(
    { status, uptime: Math.floor((Date.now() - startedAt) / 1000), db: { ok: dbOk, latencyMs: dbLatencyMs }, timestamp: new Date().toISOString() },
    dbOk ? 200 : 503,
  )
})

// ── Routes ──────────────────────────────────────────────────────────

// Webhook routes (keep at root — GitHub App settings use these paths)
app.route("/webhook/github", webhook)
app.route("/webhook/results", resultsRoute)

// All other API routes under /api/ prefix to avoid conflict with frontend SPA routes
app.route("/api/auth", auth)
app.route("/api/billing", billing)
app.route("/api/dashboard", dashboard)
app.route("/api/repos", reposRoute)
app.route("/api/events", events)
app.route("/api/coaching", coaching)
app.route("/api/team", team)
app.route("/api/webhooks", integrationWebhooks)
app.route("/api/v1", apiV1)
app.route("/api/admin", admin)
app.route("/api/tasks", tasksRoute)
app.route("/api/sse", sse)
app.route("/api/analytics", analytics)
app.route("/api/reports", reportsRoute)

// ── Start server ────────────────────────────────────────────────────
const port = Number(process.env.PORT) || 3000
logger.info({ port }, "Server starting")

const server = serve({
  fetch: app.fetch,
  port,
  hostname: "0.0.0.0",
})

logger.info({ port }, "Server is running")

// ── Background scheduler ─────────────────────────────────────────────
startScheduler()

// ── Graceful shutdown ───────────────────────────────────────────────
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully")
  server.close(() => {
    logger.info("HTTP server closed")
    pool.end().then(() => {
      logger.info("DB pool drained — exit 0")
      process.exit(0)
    }).catch(() => process.exit(1))
  })
  setTimeout(() => {
    logger.error("Forced shutdown after timeout — exit 1")
    process.exit(1)
  }, 10_000).unref()
}

process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
