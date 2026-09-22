"""Orvexa Agent Runtime — entry point.

Mengonsumsi job dari Redis Stream `agent.jobs` memakai consumer group,
lalu menjalankan agent loop. Lihat ARCHITECTURE.md §8.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
from typing import Any

import redis.asyncio as aioredis

from config import settings
from orchestrator import EventPublisher, Job, Orchestrator

logging.basicConfig(
    level=logging.INFO,
    format='{"ts":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","msg":%(message)s}',
)
logger = logging.getLogger("orvexa.worker")

_shutdown = asyncio.Event()


def _install_signal_handlers() -> None:
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown.set)


async def _ensure_group(redis: aioredis.Redis) -> None:
    try:
        await redis.xgroup_create(
            name=settings.job_stream,
            groupname=settings.consumer_group,
            id="0",
            mkstream=True,
        )
        logger.info("consumer group dibuat: %s", settings.consumer_group)
    except aioredis.ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise


async def _process(redis: aioredis.Redis, orchestrator: Orchestrator, entry: tuple[str, dict]) -> None:
    entry_id, fields = entry
    raw = fields.get("data") or fields.get(b"data")
    if raw is None:
        await redis.xack(settings.job_stream, settings.consumer_group, entry_id)
        return

    try:
        payload: dict[str, Any] = json.loads(raw)
        job = Job.from_payload(payload)
        await orchestrator.handle(job)
    except Exception:  # noqa: BLE001
        logger.exception("gagal memproses job %s", entry_id)
    finally:
        await redis.xack(settings.job_stream, settings.consumer_group, entry_id)


async def run() -> None:
    _install_signal_handlers()
    logger.info("worker starting (TZ=%s)", settings.timezone)

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    await _ensure_group(redis)

    publisher = EventPublisher(redis)
    orchestrator = Orchestrator(publisher)
    consumer = f"worker-{id(redis)}"

    try:
        while not _shutdown.is_set():
            entries = await redis.xreadgroup(
                groupname=settings.consumer_group,
                consumername=consumer,
                streams={settings.job_stream: ">"},
                count=settings.concurrency,
                block=5000,
            )
            if not entries:
                continue
            for _stream, items in entries:
                tasks = [_process(redis, orchestrator, item) for item in items]
                if tasks:
                    await asyncio.gather(*tasks)
    finally:
        await redis.aclose()
        logger.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
