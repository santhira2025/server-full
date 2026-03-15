# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Archon is a SaaS platform for AI-powered GitHub PR code review with developer coaching, team management, and billing. It consists of two packages in a monorepo layout (no workspace manager — each is independent):

- **archon-api/** — Backend API (Node.js, TypeScript, Hono framework, port 3000)
- **archon-app/** — Frontend SPA (React 19, TypeScript, Vite)
- **k8s/** — Kubernetes manifests (namespace, configmap, secrets)
- **docker-compose.yml** — Local deployment (API on :3002, app on :8081)

## Common Commands

### Backend (archon-api/)
```bash
cd archon-api
npm run dev              # Start dev server with tsx watch
npm run build            # TypeScript compile to dist/
npm run start            # Run compiled output (node dist/index.js)
npm run test             # Type-check only (tsc --noEmit)
npm run test:auth        # Run auth integration tests
npm run test:webhooks    # Run webhook integration tests
npm run test:dedup       # Run dedup logic tests
npm run test:all         # Run all integration tests
npm run tunnel           # Start smee webhook tunnel for local dev
```

### Frontend (archon-app/)
```bash
cd archon-app
npm run dev              # Vite dev server (default port 5173)
npm run build            # tsc -b && vite build
npm run lint             # ESLint
npm run preview          # Preview production build
```

### Database (Drizzle ORM)
```bash
cd archon-api
npx drizzle-kit generate   # Generate migration from schema changes
npx drizzle-kit push       # Push schema directly to DB (dev)
npx drizzle-kit migrate    # Run pending migrations
```
Config: `archon-api/drizzle.config.ts` — schema at `archon-api/src/db/schema.ts`, migrations output to `archon-api/drizzle/`.

## Architecture

### Backend (archon-api)

**Entry point:** `src/index.ts` — Hono server with CORS, logger middleware, and route mounting.

**Route layout:**
- Webhook routes are at root path (`/webhook/github`, `/webhook/results`) — these match GitHub App settings
- All other routes are under `/api/` prefix (auth, billing, dashboard, repos, events, coaching, team, webhooks, admin, tasks, sse)

**Key services** (`src/services/`):
- `review-engine.ts` — Core PR review pipeline: fetches diff via GitHub API, sends to AI, posts review comments
- `ai-proxy.ts` — Abstraction layer routing to different AI models (Claude, etc.)
- `coaching.ts` — Developer skill tracking, mistake pattern analysis
- `automation.ts` — Auto-labeling, PR risk scoring, release note generation
- `approval.ts` — Automated approval workflow
- `project-memory.ts` — Persistent project context for AI reviews
- `auth.ts` — GitHub OAuth flow, JWT token management
- `github.ts` — Octokit wrapper for GitHub API interactions
- `usage.ts` — Token/quota tracking per org
- `dispatcher.ts` — Task routing for async background work

**Auth flow:** GitHub OAuth → JWT stored in localStorage (`archon_token`) → Bearer token in Authorization header.

**Database:** PostgreSQL via Drizzle ORM. Schema in `src/db/schema.ts`. Multi-tenant by `org_id` foreign key on most tables. Key tables: `organizations`, `users`, `repos`, `reviewResults`, `developerProfiles`, `learningEvents`, `tasks`.

**Billing:** Stripe integration in `src/routes/billing.ts` and `src/config/plans.ts`. Plans: free, pro, team.

### Frontend (archon-app)

**Entry:** `src/main.tsx` → `src/App.tsx` (routing + sidebar layout).

**Routing:** React Router DOM v7. Routes defined in `App.tsx`. Pages in `src/pages/`.

**API client:** `src/lib/api.ts` — Axios instance with base URL from `VITE_API_URL` env var, auto-attaches JWT from localStorage.

**Real-time:** `src/hooks/useRealtime.ts` — SSE connection to `/api/sse` for live dashboard updates (events, reviews).

### Deployment

Both services have multi-stage Dockerfiles. Frontend builds to static assets served by Nginx (with SPA routing via `try_files`). API runs as non-root user with health check at `/api/health`.

**Docker Compose:** `docker-compose up --build` runs both services locally. API maps to port 3002, app to 8081. Expects a PostgreSQL instance on the host (connects via `host.docker.internal`).

**Kubernetes:** Manifests in `k8s/` — apply with `kubectl apply -k k8s/`. Requires cert-manager and nginx ingress controller pre-installed.

## Key Patterns

- All imports use `.js` extension even for `.ts` source files (ESM with `"type": "module"` in package.json)
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports
- GitHub App commands triggered via PR/issue comments matching `/archon <subcommand>` or `/ac <subcommand>`; adding the `archon` label also triggers the agent
- Webhook deduplication: in-memory by `x-github-delivery` header with 5-minute TTL
- The `archon-token` passed to dispatched agents is `base64(JSON.stringify({ orgId }))` — not the user JWT
- Target repos can configure Archon via `.archon/` directory: `memory.md` (project context), `rules.yml` (path-scoped review instructions)
- `tests/` directory is excluded from `tsc` compilation; tests run directly via `tsx`
- Model routing (`ai-proxy.ts`): all tiers route to Groq `llama-3.3-70b-versatile` with tier-based token limits
- Plan tiers: Free (unlimited requests, 8K tokens), Pro ($19/mo, 500 req), Team ($49/mo, 2000 req)
- Billing auto-bootstraps Stripe price IDs on startup if env vars are absent; billing is disabled entirely without `STRIPE_SECRET_KEY`

## Environment Variables

### Backend (archon-api/)
| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret |
| `GITHUB_APP_ID` | GitHub App numeric ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App PEM private key (supports literal `\n` escape) |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret |
| `GITHUB_WEBHOOK_SECRET` | Webhook signature verification secret |
| `GROQ_API_KEY` | Groq API key (primary AI provider) |
| `ANTHROPIC_API_KEY` | Anthropic API key (passed to dispatched agents) |
| `ARCHON_API_URL` | Public URL of this API (used in workflow dispatch) |
| `FRONTEND_URL` | Frontend URL for CORS (default: `http://localhost:5173`) |
| `PORT` | Server port (default: 3000) |
| `STRIPE_SECRET_KEY` | Stripe API key (billing disabled if absent) |
| `STRIPE_PRICE_PRO` | Stripe price ID for Pro plan (auto-bootstrapped if absent) |
| `STRIPE_PRICE_TEAM` | Stripe price ID for Team plan (auto-bootstrapped if absent) |
| `SMEE_URL` | Smee.io channel URL for local dev webhook tunnel |

### Frontend (archon-app/)
| Variable | Purpose |
|----------|---------|
| `VITE_API_URL` | API base URL (default: `http://localhost:3000`, passed at build time) |
