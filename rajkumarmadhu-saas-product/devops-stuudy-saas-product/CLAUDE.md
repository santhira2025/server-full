# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Santhira** is a DevOps Master Platform — an enterprise SaaS product by Rajkumar Madhu (Founder & CTO). It provides AI-powered DevOps tooling across 8 core modules: Learning Engine, Deployment Engine, Troubleshooter AI, Interview Engine, Log Analyzer, 5-Point Expander, Config Vault, and Architecture Generator.

## Current State

Early prototype with a working Streamlit dashboard and two FastAPI backends (Troubleshooter AI and Insights API). No database or real LLM integrations yet — services use in-memory data and simulated AI responses.

## Commands

```bash
# Install (editable mode, includes all deps)
pip install -e .

# Run Streamlit dashboard (port 8501)
python -m streamlit run dashboard/app.py --server.port 8501 --server.headless true

# Run Troubleshooter API backend (port 8000)
uvicorn backend.main:app --host 0.0.0.0 --port 8000

# Run Insights API backend (port 8000)
uvicorn backend.insights_api:app --host 0.0.0.0 --port 8000 --reload

# Run all tests
pytest

# Run a single test file
pytest tests/test_parser_enterprise.py

# Run a specific test
pytest tests/test_parser_enterprise.py::TestParserEnterprise::test_name -v

# Docker build
docker build -t santhira .
```

## Architecture

### Two FastAPI Apps (not yet unified)

- **`backend/main.py`** — Troubleshooter AI API. Mounts routes from `backend/troubleshooter/api/routes.py`. Endpoints: `POST /api/v1/troubleshoot`, `POST /api/v1/troubleshoot/stream`, `GET /api/v1/troubleshoot/stats`, `GET /api/v1/troubleshoot/errors/search`.
- **`backend/insights_api.py`** — Insights/Dashboard API. Serves HTML dashboards (`/enterprise`, `/traffic`, `/learn`) and AI agent endpoints (`/api/generate-podcast`, `/api/study-image`, `/api/trigger-chaos`). Currently uses simulated workflows.

### Troubleshooter AI Module (`backend/troubleshooter/`)

The first fully-structured module, using an 8-step pipeline: Parse → Classify → Retrieve → RCA → Fix → Prevention → Feedback.

```
backend/troubleshooter/
├── api/routes.py          # FastAPI router
├── core/troubleshooter.py # TroubleshooterService orchestrator
├── models/schemas.py      # Pydantic models (request/response, enums)
├── services/parser.py     # Error parsing and classification logic
├── services/knowledge_base.py  # In-memory error catalog + matching
├── integration.py         # Convenience wrapper used by dashboard
└── data/                  # (placeholder for future data files)
```

### Dashboard (`dashboard/app.py`)

Single-file Streamlit app (~2000+ lines) covering all 8 modules with 12 navigation pages. Imports from `backend/troubleshooter/integration.py` when the backend is available, falls back to demo mode otherwise.

## Key Files

- `DevOps_Master_Platform_Blueprint.docx` — Full product spec (8 modules, 16 microservices, 43 API endpoints, DB schema, K8s layout, pricing, roadmap)
- `.env.example` — All environment variables (API keys for Anthropic/OpenAI/Gemini, Supabase, n8n webhooks, Cloudflare, Sentry, LiveKit)
- `backend/n8n_workflows.json` — n8n automation workflow definitions

## Design Conventions

- **Theme**: Dark gradient background (`#0a0e17` → `#0f1520`), accent `#00d4aa`, monospace JetBrains Mono for code, DM Sans for UI text
- **Testing**: pytest with `asyncio_mode = auto` (see `pytest.ini`); test files in `tests/`
- **Dockerfile**: Multi-stage build (builder + production), runs on port 8001 with 4 workers, non-root user

## Platform: Windows (MINGW64)

- Use Unix shell syntax in Claude Code, but Python may use backslashes for paths
- Use `encoding="utf-8"` explicitly when reading/writing files to avoid cp1252 issues
