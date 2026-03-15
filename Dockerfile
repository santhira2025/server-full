FROM python:3.12-slim AS base

LABEL maintainer="Santhira <rajkumar@santhira.com>"
LABEL description="RedisNexus MCP Server - Enterprise Redis Operations Intelligence"
LABEL version="1.0.0"

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY redis_mcp_server.py .

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import redis; r=redis.Redis(); r.ping()" || exit 1

# Non-root user
RUN adduser --disabled-password --gecos '' appuser
USER appuser

# Default: stdio transport. Override with --http for HTTP transport
ENTRYPOINT ["python", "redis_mcp_server.py"]
CMD ["--http", "--port=8000"]

EXPOSE 8000
