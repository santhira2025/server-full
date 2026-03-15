# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run development server (auto-reload)
python run.py
# or
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests
pytest tests/ -v
pytest tests/ -v --asyncio-mode=auto   # for async tests
pytest tests/test_webhook.py::test_health_check -v  # single test

# Docker
docker build -t whatsapp-agent:latest .
docker run -p 8000:8000 --env-file .env whatsapp-agent:latest

# Kubernetes deployment (one-command)
./k8s/deploy.sh
```

## Architecture

**Message Processing Pipeline** (critical path):
1. Meta sends `POST /api/webhook` → `app/api/webhook.py` extracts message via `WhatsAppService.extract_message_data()`
2. `database.py` upserts conversation (by phone_number) and saves inbound message
3. `ai_engine.py` builds `SalesContext` with last 20 messages of history, calls Claude (Anthropic SDK), falls back to OpenAI, then generic response
4. `whatsapp_service.py` sends reply via Meta Graph API v21.0
5. `database.py` saves outbound message, updates lead_score (clamped 0–100), lead_stage, sentiment

**AI Response Contract** — `ai_engine.py` requires Claude to return JSON:
```json
{
  "reply_text": "...",
  "intent_detected": "greeting|inquiry|pricing|objection|buying_signal|complaint|follow_up|general",
  "sentiment": "positive|neutral|negative",
  "lead_score_delta": -10..15,
  "suggested_stage": "new|engaged|qualified|proposal|negotiation|closed_won|closed_lost",
  "confidence": 0.0..1.0,
  "should_escalate": false,
  "extracted_name": "..."
}
```
If Claude returns non-JSON, `_parse_ai_response()` wraps the raw text as a `general` intent with neutral sentiment and 0 delta.

**Database** — Direct psycopg2 (no ORM, no async driver). `DatabaseService` holds a single connection and reconnects on `InterfaceError`. Two tables (`conversations`, `messages`) auto-created on startup via `db.init_tables()` called from FastAPI lifespan. No migrations framework — schema changes require manual `ALTER TABLE`.

**Dashboard** — Jinja2 templates served from `/dashboard/templates/`. Frontend polls `/dashboard/api/*` JSON endpoints every 30 seconds. Revenue pipeline metric hardcodes ₹15,000 per `closed_won` deal.

## Key Configuration (`app/core/config.py`)

| Variable | Default | Notes |
|---|---|---|
| `AI_MODEL` | `claude-sonnet-4-6` | Claude model ID |
| `WHATSAPP_VERIFY_TOKEN` | `finspot-verify-2024` | Meta webhook verification |
| `DB_HOST` | `postgres-service` | K8s service name; use `localhost` locally |
| `TIMEZONE` | `Asia/Kolkata` | Used in dashboard display |
| `BUSINESS_NAME` | `Finspot` | Injected into AI system prompt |

Copy `.env.example` to `.env` to start. Required keys: `WHATSAPP_API_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `ANTHROPIC_API_KEY`.

## K8s Deployment Notes

- Namespace: `whatsapp-agent`, Ingress host: `fs-le-dev-wa.finspot.in`
- PostgreSQL runs as a K8s pod (`postgres-service`), not an external managed DB
- App image: `finspot/whatsapp-agent:latest` — must be built and pushed before running `deploy.sh`
- HPA scales app from 2→10 replicas at 70% CPU / 80% memory
- `k8s/secrets.yaml` contains real credentials — do not commit changes to this file
