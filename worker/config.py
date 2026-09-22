"""Konfigurasi Orvexa worker dari environment variable."""

from __future__ import annotations

import os
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
        )


settings = Settings.load()
