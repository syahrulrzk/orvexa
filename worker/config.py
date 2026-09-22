"""Konfigurasi Orvexa worker dari environment variable."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


def _env(key: str, default: str | None = None) -> str:
    value = os.environ.get(key, default)
    if value is None:
        raise RuntimeError(f"Environment variable wajib belum diset: {key}")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    redis_url: str
    internal_api_token: str
    master_key: str
    timezone: str
    concurrency: int
    consumer_group: str
    job_stream: str
    web_url: str
    consumer_name: str
    agent_max_steps: int
    agent_max_tokens: int
    agent_timeout_seconds: int

    @staticmethod
    def load() -> "Settings":
        return Settings(
            database_url=_env("DATABASE_URL"),
            redis_url=os.environ.get("REDIS_URL", "redis://localhost:6379"),
            internal_api_token=os.environ.get("INTERNAL_API_TOKEN", ""),
            master_key=os.environ.get("ORVEXA_MASTER_KEY", ""),
            timezone=os.environ.get("TZ", "Asia/Jakarta"),
            concurrency=int(os.environ.get("WORKER_CONCURRENCY", "4")),
            consumer_group=os.environ.get("WORKER_CONSUMER_GROUP", "orvexa-workers"),
            job_stream=os.environ.get("WORKER_JOB_STREAM", "agent.jobs"),
            # URL internal API Next.js (di docker compose: http://web:3000).
            web_url=os.environ.get("ORVEXA_WEB_URL", "http://localhost:3000").rstrip("/"),
            # Nama consumer unik per proses (hostname:pid) agar Redis Streams
            # bisa melacak pending entry per instance.
            consumer_name=os.environ.get(
                "WORKER_CONSUMER_NAME", f"worker-{socket.gethostname()}-{os.getpid()}"
            ),
            agent_max_steps=int(os.environ.get("AGENT_MAX_STEPS", "8")),
            agent_max_tokens=int(os.environ.get("AGENT_MAX_TOKENS", "12000")),
            agent_timeout_seconds=int(os.environ.get("AGENT_TIMEOUT_SECONDS", "180")),
        )


settings = Settings.load()
