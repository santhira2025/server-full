FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    libpcap-dev \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_lg || python -m spacy download en_core_web_sm

# Copy the server directory
COPY server/ ./server/
COPY alembic.ini .
COPY migrations/ ./migrations/

# Expose FastAPI port
EXPOSE 8000

# Create a non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app
USER appuser

# Run Uvicorn
CMD ["uvicorn", "server.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
