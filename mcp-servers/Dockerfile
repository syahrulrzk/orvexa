FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Jakarta

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends tzdata \
  && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
  && echo $TZ > /etc/timezone \
  && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir "httpx>=0.27,<1.0"

COPY common.py prometheus_server.py grafana_server.py wazuh_server.py docker_server.py kubernetes_server.py unifi_server.py mikrotik_server.py fortigate_server.py ./

# Jalankan sebagai non-root
RUN useradd -m -u 1001 mcp && chown -R mcp:mcp /app
USER mcp

# CMD ditimpa per-service di docker-compose (server yang berbeda).
CMD ["python", "prometheus_server.py"]
