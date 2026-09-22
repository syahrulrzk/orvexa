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
from orchestrator import Job, Orchestrator
from runtime import InternalAPI

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


async def _process(orchestrator: Orchestrator, entry: tuple[str, dict[str, Any]]) -> None:
    entry_id, fields = entry
    raw = fields.get("data") or fields.get(b"data")
    if raw is None:
        logger.warning("job %s tanpa field `data` — dilewati", entry_id)
        return

    try:
        payload: dict[str, Any] = json.loads(raw)
        job = Job.from_payload(payload)
        await orchestrator.handle(job)
    except Exception:  # noqa: BLE001 - satu job gagal tidak boleh menghentikan worker
        logger.exception("gagal memproses job %s", entry_id)


async def run() -> None:
    _install_signal_handlers()
    logger.info(
        "worker starting (TZ=%s, web=%s, consumer=%s)",
        settings.timezone,
        settings.web_url,
        settings.consumer_name,
    )

    if not settings.internal_api_token:
        logger.warning(
            "INTERNAL_API_TOKEN kosong — worker tidak bisa persist run. "
            "Set di .env agar sama dengan nilai di web."
        )

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)
    await _ensure_group(redis)

    async with InternalAPI(
        settings.web_url, settings.internal_api_token, timeout=30.0
    ) as api:
        orchestrator = Orchestrator(
            redis, api, timeout_seconds=settings.agent_timeout_seconds
        )
        consumer = settings.consumer_name
        semaphore = asyncio.Semaphore(settings.concurrency)

        async def run_one(entry: tuple[str, dict[str, Any]]) -> None:
            entry_id = entry[0]
            try:
                async with semaphore:
                    await _process(orchestrator, entry)
            finally:
                # ACK selalu (termasuk saat gagal) agar tidak menumpuk di PEL.
                # Retry berjenjang akan ditambahkan bersama dead-letter (Fase 5).
                await redis.xack(settings.job_stream, settings.consumer_group, entry_id)

        try:
            while not _shutdown.is_set():
                try:
                    entries = await redis.xreadgroup(
                        groupname=settings.consumer_group,
                        consumername=consumer,
                        streams={settings.job_stream: ">"},
                        count=settings.concurrency,
                        block=5000,
                    )
                except aioredis.ResponseError as exc:
                    logger.error("xreadgroup gagal: %s", exc)
                    await asyncio.sleep(2)
                    continue

                if not entries:
                    continue

                tasks: list[asyncio.Task[None]] = []
                for _stream, items in entries:
                    for item in items:
                        tasks.append(asyncio.create_task(run_one(item)))
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
        finally:
            await redis.aclose()
            logger.info("worker stopped")


if __name__ == "__main__":
    asyncio.run(run())
