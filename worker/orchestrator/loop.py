"""Agent loop (skeleton).

Alur sesuai ARCHITECTURE.md §8.2:

    Event → muat konteks → evaluate goal → cek permission & budget
    → [approval?] → pilih tool/agent → eksekusi → evaluasi → persist

Implementasi penuh (LLM call, RAG, tool execution) ada di Fase 3–4.
Saat ini fokus pada kontrak & struktur agar mudah dilanjutkan.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from .strategy import Strategy

logger = logging.getLogger("orvexa.orchestrator")


@dataclass
class Job:
    job_id: str
    type: str
    company_id: str
    agent_id: str
    room_id: str | None
    trigger: dict[str, Any]
    budget: dict[str, int]
    trace_id: str

    @staticmethod
    def from_payload(payload: dict[str, Any]) -> "Job":
        return Job(
            job_id=payload["job_id"],
            type=payload.get("type", "agent.run"),
            company_id=payload["company_id"],
            agent_id=payload["agent_id"],
            room_id=payload.get("room_id"),
            trigger=payload.get("trigger", {}),
            budget=payload.get("budget", {"max_steps": 8, "max_tokens": 12000}),
            trace_id=payload.get("trace_id", ""),
        )


class Orchestrator:
    """Menjalankan satu run agent.

    Strategi orkestrasi bersifat pluggable (lihat ADR-007) sehingga
    implementasi default bisa diganti tanpa mengubah alur job/event.
    """

    def __init__(self, publisher: "EventPublisher", strategy: "Strategy | None" = None) -> None:
        self._publisher = publisher
        if strategy is None:
            from .strategy import DefaultStrategy

            strategy = DefaultStrategy(publisher)
        self._strategy = strategy

    async def handle(self, job: Job) -> None:
        logger.info(
            "run start",
            extra={
                "job_id": job.job_id,
                "agent_id": job.agent_id,
                "strategy": self._strategy.name,
                "trace_id": job.trace_id,
            },
        )
        try:
            await self._strategy.run(job, self)
        except Exception:  # noqa: BLE001 - nanti: persist sebagai run failed
            logger.exception("run failed", extra={"job_id": job.job_id})
            await self._publisher.agent_status(job, "error")


class EventPublisher:
    """Menerbitkan event ke room.events.{room_id} via Redis Pub/Sub.

    Implementasi nyata (redis client) di-wire di main.py.
    """

    def __init__(self, redis: Any | None = None) -> None:
        self._redis = redis

    async def agent_status(self, job: Job, status: str) -> None:
        logger.debug("agent status", extra={"agent_id": job.agent_id, "status": status})
        if self._redis is None or job.room_id is None:
            return
        # await self._redis.publish(f"room.events.{job.room_id}", json.dumps({...}))
