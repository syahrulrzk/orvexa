"""Orvexa Agent Runtime — entry point.

Mengonsumsi job dari Redis Stream `agent.jobs` memakai consumer group,
lalu menjalankan agent loop. Lihat ARCHITECTURE.md §8.
"""

from __future__ import annotations

import asyncio
import json
import logging
import signal
import time
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


async def _process(
    orchestrator: Orchestrator,
    redis: aioredis.Redis,
    entry: tuple[str, dict[str, Any]],
) -> bool:
    """Proses satu entry; return True bila boleh di-ACK (sukses / gagal final)."""
    entry_id, fields = entry
    raw = fields.get("data") or fields.get(b"data")
    if raw is None:
        logger.warning("job %s tanpa field `data` — dilewati", entry_id)
        return True  # payload rusak: tidak ada gunanya di-retry

    try:
        payload: dict[str, Any] = json.loads(raw)
        job = Job.from_payload(payload)
        ok = await orchestrator.handle(job)
        return ok
    except Exception:  # noqa: BLE001 - satu job gagal tidak boleh menghentikan worker
        logger.exception("gagal memproses job %s", entry_id)
        return False


async def _reclaim_stale(
    redis: aioredis.Redis,
    orchestrator: Orchestrator,
) -> None:
    """OQ-09: ambil alih entry PEL yang terlantar (consumer mati/gagal).

    XAUTOCLAIM memindahkan kepemilikan entry yang idle melebihi
    `settings.reclaim_idle_ms` ke consumer ini. Entry yang sudah melewati
    MAX_DELIVERIES dipindah ke stream dead-letter `agent.jobs.dead` lalu
    di-ACK dari stream utama.
    """
    try:
        cursor, entries, _ = await redis.xautoclaim(
            settings.job_stream,
            settings.consumer_group,
            settings.consumer_name,
            min_idle_time=settings.reclaim_idle_ms,
            start_id="0-0",
            count=10,
        )
    except aioredis.ResponseError as exc:
        # Redis < 6.2 tidak punya XAUTOCLAIM — lewati diam-diam (fallback
        # perilaku lama: entry tetap di PEL sampai manual diintervensi).
        logger.debug("xautoclaim tidak tersedia: %s", exc)
        return
    except Exception:  # noqa: BLE001
        logger.warning("gagal reclaim PEL", exc_info=True)
        return

    for entry_id, fields in entries or []:
        deliveries = await _delivery_count(redis, entry_id)
        if deliveries > settings.max_deliveries:
            await _dead_letter(redis, orchestrator, entry_id, fields, deliveries)
            continue
        logger.warning(
            "reclaim job %s (deliveries=%d) — diproses ulang",
            entry_id,
            deliveries,
        )
        ok = await _process(orchestrator, redis, (entry_id, fields))
        if ok:
            await redis.xack(settings.job_stream, settings.consumer_group, entry_id)


async def _delivery_count(redis: aioredis.Redis, entry_id: str) -> int:
    """Ambil jumlah delivery entry dari XPENDING (format respons ioredis:
    list dict dengan key `times_delivered` atau integer kedua — tangani dua-duanya)."""
    try:
        pending = await redis.xpending_range(
            settings.job_stream,
            settings.consumer_group,
            min=entry_id,
            max=entry_id,
            count=1,
        )
        if not pending:
            return 0
        item = pending[0]
        if isinstance(item, dict):
            return int(item.get("times_delivered") or 0)
        return int(item[3]) if len(item) > 3 else 0  # format tuple (id, consumer, idle, deliveries)
    except Exception:  # noqa: BLE001
        return 0


async def _dead_letter(
    redis: aioredis.Redis,
    orchestrator: Orchestrator,
    entry_id: str,
    fields: dict[str, Any],
    deliveries: int,
) -> None:
    """Pindahkan job gagal-berulang ke stream `agent.jobs.dead` + tutup run
    terkait (bila bisa) agar tidak menggantung, lalu ACK dari stream utama."""
    raw = fields.get("data") or fields.get(b"data")
    logger.error(
        "job %s gagal %d kali → dead-letter (%s)",
        entry_id,
        deliveries,
        settings.dead_stream,
    )
    try:
        await redis.xadd(
            settings.dead_stream,
            {
                "data": raw if isinstance(raw, (bytes, str)) else json.dumps(fields),
                "source_id": entry_id,
                "deliveries": str(deliveries),
                "failed_at": str(int(time.time())),
            },
        )
    except Exception:  # noqa: BLE001
        logger.exception("gagal menulis dead-letter untuk %s", entry_id)

    # Tutup run yang mungkin menggantung (best-effort).
    try:
        if isinstance(raw, (bytes, str)):
            payload = json.loads(raw)
            job = Job.from_payload(payload)
            await orchestrator.publisher.run_finished(
                job.room_id, job.agent_id, "", "failed", error="dead_lettered"
            )
    except Exception:  # noqa: BLE001
        logger.debug("gagal menutup run untuk job dead-lettered %s", entry_id, exc_info=True)

    try:
        await redis.xack(settings.job_stream, settings.consumer_group, entry_id)
    except Exception:  # noqa: BLE001
        logger.exception("gagal ACK entry dead-lettered %s", entry_id)


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
        last_reclaim = 0.0
        RECLAIM_INTERVAL = 30.0  # detik antar pemindaian PEL

        async def run_one(entry: tuple[str, dict[str, Any]]) -> None:
            entry_id = entry[0]
            try:
                async with semaphore:
                    ok = await _process(orchestrator, redis, entry)
            except Exception:  # noqa: BLE001 - kegagalan tak terduga dianggap gagal
                logger.exception("error tak terduga memproses %s", entry_id)
                ok = False
            finally:
                # OQ-09: ACK hanya bila sukses. Entry gagal TETAP di PEL dan
                # akan di-reclaim + di-retry (sampai MAX_DELIVERIES) oleh
                # `_reclaim_stale`, lalu dead-letter bila terus gagal.
                if ok:
                    try:
                        await redis.xack(settings.job_stream, settings.consumer_group, entry_id)
                    except Exception:  # noqa: BLE001
                        logger.exception("gagal ACK %s", entry_id)

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
                    # Idle: sekali-sekali scan PEL untuk reclaim/retry/dead-letter.
                    now = time.monotonic()
                    if now - last_reclaim >= RECLAIM_INTERVAL:
                        last_reclaim = now
                        try:
                            await _reclaim_stale(redis, orchestrator)
                        except Exception:  # noqa: BLE001
                            logger.warning("reclaim gagal", exc_info=True)
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
