# F1 24 Custom HUD Telemetry Core - Docker Container
# High-performance async UDP ingestion (20777/udp) + FastAPI WebSocket broadcast (8000/tcp)

FROM python:3.12-slim

# Prevent Python from writing .pyc files and buffer stdout/stderr
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    F1_UDP_HOST=0.0.0.0 \
    F1_UDP_PORT=20777 \
    API_HOST=0.0.0.0 \
    API_PORT=8000

WORKDIR /app

# Install curl for container health check
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install python dependencies first (cached layer)
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code and initial configuration
COPY backend /app/backend
COPY hud_config.json /app/hud_config.json

# Expose HTTP/WebSocket API (TCP) and F1 Telemetry Ingest (UDP)
EXPOSE 8000/tcp
EXPOSE 20777/udp

# Health check endpoint
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Start telemetry server listening on 0.0.0.0
CMD ["uvicorn", "backend.server:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]

