# ─────────────────────────────────────────────────────────────
# Santhira DevOps Platform — Dockerfile
# Multi-stage build for lean, production-ready container
# ─────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# ── Stage 2: Production Image ────────────────────────────────
FROM python:3.12-slim AS production

WORKDIR /app

# Install only runtime deps (no gcc)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages from builder stage (lean final image)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application source code
COPY . .

# Use non-root user for security
RUN useradd --create-home santhira
USER santhira

# Expose backend port
EXPOSE 8001

# Health check so Docker knows if the container is alive
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8001/health || exit 1

# Run the FastAPI server via uvicorn in production mode
CMD ["uvicorn", "backend.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8001", \
     "--workers", "4", \
     "--no-reload"]
