#!/usr/bin/env python3
"""Integrasi test OQ-09: retry berjenjang + dead-letter (Redis asli).

Skenario (mock orchestrator — tanpa web API):
  1. Job sukses            → ACK (tidak ada di PEL)
  2. Job gagal             → tetap di PEL (belum ACK)
  3. _reclaim_stale ambil  → retry; gagal lagi → tetap di PEL
  4. deliveries > MAX      → pindah ke agent.jobs.dead + ACK dari stream utama

Jalankan (butuh Redis di localhost:6379):
    python3 scripts/dev/test-retry-deadletter.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import redis.asyncio as aioredis

sys.path.insert(0, "worker")

from config import settings  # noqa: E402
from orchestrator import Job, Orchestrator  # noqa: E402

STREAM = "test.retry.jobs"
DEAD = "test.retry.jobs.dead"
GROUP = "test-retry-group"
CONSUMER = "test-consumer"


class FakePublisher:
    def __init__(self) -> None:
        self.finished: list[tuple] = []

    async def run_finished(self, room_id, agent_id, run_id, status, **kwargs):
        self.finished.append((room_id, agent_id, run_id, status, kwargs))


class FlakyOrchestrator:
    """Orchestrator tiruan: gagal untuk job tertentu, sukses selain itu."""

    def __init__(self, fail_job_ids: set[str]) -> None:
        self.fail_job_ids = fail_job_ids
        self.publisher = FakePublisher()
        self.processed: list[str] = []

    async def handle(self, job: Job) -> bool:
        self.processed.append(job.job_id)
        return job.job_id not in self.fail_job_ids


def make_job(job_id: str, fail: bool) -> dict:
    return {
        "job_id": job_id,
        "type": "agent.run",
        "company_id": "cmp_test",
        "agent_id": "agt_test",
        "room_id": None,
        "trigger": {"kind": "manual", "fail": fail},
        "budget": {"max_steps": 8, "max_tokens": 12000},
        "trace_id": "trc_test",
    }


async def main() -> None:
    # Injeksi stream pengujian ke settings (frozen dataclass → object.__setattr__).
    for field, value in {
        "job_stream": STREAM,
        "consumer_group": GROUP,
        "consumer_name": CONSUMER,
        "dead_stream": DEAD,
        "reclaim_idle_ms": 10,  # langsung bisa direclaim
        "max_deliveries": 3,
    }.items():
        object.__setattr__(settings, field, value)

    redis = aioredis.from_url(settings.redis_url, decode_responses=True)

    # Bersihkan stream test.
    for key in (STREAM, DEAD):
        await redis.delete(key)
    await redis.xgroup_create(STREAM, GROUP, id="0", mkstream=True)

    ok_orch = FlakyOrchestrator(fail_job_ids=set())
    orchestrator_ref = FlakyOrchestrator(fail_job_ids={"job-fail"})

    # --- 1. job sukses → di-ACK ---
    await redis.xadd(STREAM, {"data": json.dumps(make_job("job-ok", False))})
    entries = await redis.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10)
    for _stream, items in entries:
        for entry_id, fields in items:
            ok = await _process_like(orchestrator_ref, redis, (entry_id, fields))
            assert ok, "job-ok seharusnya sukses"
            await redis.xack(STREAM, GROUP, entry_id)
    pending = await redis.xpending(STREAM, GROUP)
    assert pending["pending"] == 0, f"PEL harus kosong, dapat {pending}"
    print("✓ 1. job sukses → di-ACK, PEL kosong")

    # --- 2. job gagal → tetap di PEL ---
    await redis.xadd(STREAM, {"data": json.dumps(make_job("job-fail", True))})
    entries = await redis.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10)
    fail_entry_id = None
    for _stream, items in entries:
        for entry_id, fields in items:
            ok = await _process_like(orchestrator_ref, redis, (entry_id, fields))
            assert not ok
            fail_entry_id = entry_id  # TIDAK di-ACK (perilaku baru)
    pending = await redis.xpending(STREAM, GROUP)
    assert pending["pending"] == 1, f"job gagal harus tetap di PEL, dapat {pending}"
    print("✓ 2. job gagal → tetap di PEL (tidak hilang diam-diam)")

    # --- 3. retry: sukses setelah gagal → ACK ---
    orchestrator_retry = FlakyOrchestrator(fail_job_ids=set())  # sekarang sukses
    from main import _reclaim_stale

    await asyncio.sleep(0.05)  # entry harus idle > reclaim_idle_ms dulu
    await _reclaim_stale(redis, orchestrator_retry)
    pending = await redis.xpending(STREAM, GROUP)
    assert pending["pending"] == 0, f"retry sukses harus di-ACK, PEL: {pending}"
    assert "job-fail" in orchestrator_retry.processed
    print("✓ 3. reclaim → retry sukses → ACK")

    # --- 4. gagal berulang > MAX_DELIVERIES → dead-letter ---
    await redis.xadd(STREAM, {"data": json.dumps(make_job("job-dead", True))})
    entries = await redis.xreadgroup(GROUP, CONSUMER, {STREAM: ">"}, count=10)
    for _stream, items in entries:
        for entry_id, fields in items:
            await _process_like(orchestrator_ref, redis, (entry_id, fields))
            # gagal — tidak di-ACK

    # Simulasi delivery bertambah (gagal berulang via reclaim).
    flaky_dead = FlakyOrchestrator(fail_job_ids={"job-dead"})
    for _ in range(4):  # melewati MAX_DELIVERIES=3
        await asyncio.sleep(0.05)
        await _reclaim_stale(redis, flaky_dead)

    dead_len = await redis.xlen(DEAD)
    assert dead_len >= 1, f"dead-letter harus berisi, dapat {dead_len}"
    pending = await redis.xpending(STREAM, GROUP)
    assert pending["pending"] == 0, f"dead-lettered harus di-ACK dari stream utama, PEL: {pending}"
    dead_msgs = await redis.xrange(DEAD, count=10)
    assert any("job-dead" in (m[1].get("data") or "") for m in dead_msgs), dead_msgs
    print(f"✓ 4. gagal > 3x → dead-letter ({DEAD}) + ACK dari stream utama")

    await redis.delete(STREAM, DEAD)
    await redis.aclose()
    print("TEST OQ-09 OK")


async def _process_like(orch: FlakyOrchestrator, redis: aioredis.Redis, entry) -> bool:
    """Mirror `_process` di main.py tanpa mengimpor settings."""
    entry_id, fields = entry
    raw = fields.get("data")
    try:
        payload = json.loads(raw)
        job = Job.from_payload(payload)
        return await orch.handle(job)
    except Exception:
        return False


if __name__ == "__main__":
    asyncio.run(main())
