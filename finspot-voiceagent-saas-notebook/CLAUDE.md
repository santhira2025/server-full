# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Finspot Voice Agent SaaS — a voice agent application. The project is in early stages.

## Infrastructure

- **Containerization**: Docker and Docker Compose
- **Orchestration**: Kubernetes (k8s directory, GKE via gcloud)
- **CI/CD**: GitHub Actions (`.github/workflows/`)

## Expected Tech Stack

Based on `.dockerignore` patterns:
- **Backend**: Python (pytest for testing)
- **Frontend/Services**: Node.js/TypeScript (vitest for testing)
- **Structure**: Multi-service architecture under a `services/` directory

## Common Commands

```bash
# Docker
docker compose up
docker compose build

# Node.js testing
npx vitest run --reporter=verbose

# Python testing
pytest

# TypeScript type checking
npm run typecheck
```
