FROM python:3.12-slim AS base

LABEL maintainer="Santhira <rajkumar@santhira.com>"
LABEL description="RabbitNexus MCP Server - Enterprise RabbitMQ Operations Intelligence"
LABEL version="1.0.0"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY rabbitmq_mcp_server.py .

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import httpx; r=httpx.get('http://localhost:15672/api/overview',auth=('guest','guest')); r.raise_for_status()" || exit 1

RUN adduser --disabled-password --gecos '' appuser
USER appuser

ENTRYPOINT ["python", "rabbitmq_mcp_server.py"]
CMD ["--http", "--port=8001"]

EXPOSE 8001
