"""Agent loop (Fase 3).

Alur sesuai ARCHITECTURE.md §8.2:

    Event → muat konteks → cek budget/izin → LLM (streaming)
    → [tool call] → eksekusi tool → ulangi → persist hasil

Orchestrator memegang **siklus hidup run** (create/close/status), sedangkan
strategi (`strategy.py`) memegang logika reasoning sehingga bisa ditukar
(ADR-007).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from runtime import BudgetExceeded, BudgetGuard, InternalAPI, RoomPublisher

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


@dataclass
class RunContext:
    """State satu run yang dibagikan ke strategi."""

    job: Job
    run_id: str
    context: dict[str, Any]
    budget: BudgetGuard
    api: InternalAPI
    publisher: RoomPublisher
    started_at: float = field(default_factory=time.monotonic)
    events: list[dict[str, Any]] = field(default_factory=list)
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    result: str | None = None

    def add_event(self, event_type: str, payload: dict[str, Any]) -> None:
        """Buffer event audit; dikirim batch di akhir run."""
        if len(self.events) < 500:
            self.events.append({"event_type": event_type, "payload": payload})

    @property
    def agent_name(self) -> str:
        agent = self.context.get("agent") or {}
        return str(agent.get("display_name") or agent.get("name") or self.job.agent_id)

    @property
    def room_id(self) -> str | None:
        return self.job.room_id

    @property
    def duration_ms(self) -> int:
        return int((time.monotonic() - self.started_at) * 1000)


class Orchestrator:
    """Menjalankan satu job agent end-to-end."""

    def __init__(
        self,
        redis: Any,
        api: InternalAPI,
        strategy: "Strategy | None" = None,
        *,
        timeout_seconds: int = 180,
    ) -> None:
        self.api = api
        self.publisher = RoomPublisher(redis)
        self.timeout_seconds = timeout_seconds
        if strategy is None:
            from .strategy import DefaultStrategy

            strategy = DefaultStrategy()
        self._strategy = strategy

    async def handle(self, job: Job) -> None:
        log_extra = {
            "job_id": job.job_id,
            "agent_id": job.agent_id,
            "room_id": job.room_id,
            "strategy": self._strategy.name,
            "trace_id": job.trace_id,
        }

        trigger_message_id = job.trigger.get("message_id")
        parent_run_id = job.trigger.get("parent_run_id")

        try:
            context = await self.api.get_context(
                job.agent_id,
                room_id=job.room_id,
                trigger_message_id=trigger_message_id,
            )
        except Exception:  # noqa: BLE001 - konteks gagal → run tidak bisa jalan
            logger.exception("gagal memuat konteks agent", extra=log_extra)
            await self.publisher.run_finished(
                job.room_id, job.agent_id, "", "failed", error="context_load_failed"
            )
            return

        agent_budget = context.get("budget") or {}
        run_id = ""

        try:
            created = await self.api.create_run(
                agent_id=job.agent_id,
                room_id=job.room_id,
                trigger_kind=str(job.trigger.get("kind") or "manual"),
                trigger_ref_id=trigger_message_id,
                parent_run_id=parent_run_id if isinstance(parent_run_id, str) and parent_run_id else None,
            )
            run_id = (created.get("run") or {}).get("id") or ""

            guard = BudgetGuard(
                max_steps=int(job.budget.get("max_steps") or agent_budget.get("max_steps") or 8),
                max_tokens=int(job.budget.get("max_tokens") or agent_budget.get("max_tokens") or 12000),
                daily_cost_limit=(context.get("agent") or {}).get("daily_cost_limit"),
            )

            run_ctx = RunContext(
                job=job,
                run_id=run_id,
                context=context,
                budget=guard,
                api=self.api,
                publisher=self.publisher,
            )

            # Delegasi: gabungkan info trigger dari job ke konteks supaya
            # prompt tahu sub-tugas yang diterima (F4-01).
            if parent_run_id:
                trigger_ctx = context.setdefault("trigger", {})
                trigger_ctx["kind"] = "delegation"
                trigger_ctx["parent_run_id"] = parent_run_id
                trigger_ctx["task"] = job.trigger.get("task")
                trigger_ctx["delegator_agent_id"] = job.trigger.get("delegator_agent_id")

            await self.publisher.run_started(job.room_id, job.agent_id, run_id)
            await self.api.set_agent_status(job.agent_id, "thinking", room_id=job.room_id, run_id=run_id)

            async with asyncio.timeout(self.timeout_seconds):
                await self._strategy.run(job, self, run_ctx)

            await self._close_run(run_ctx, status="completed", error=None)
            logger.info(
                "run selesai",
                extra={**log_extra, "run_id": run_id, **guard.snapshot()},
            )
        except BudgetExceeded as exc:
            logger.warning("budget habis: %s", exc, extra=log_extra)
            await self._close_run_failed(job, run_id, str(exc), status="cancelled", guard_locals=locals())
        except TimeoutError:
            logger.error("run timeout (%ss)", self.timeout_seconds, extra=log_extra)
            await self._close_run_failed(
                job, run_id, f"Timeout setelah {self.timeout_seconds}s", guard_locals=locals()
            )
        except Exception as exc:  # noqa: BLE001 - jangan biarkan worker mati
            logger.exception("run gagal", extra=log_extra)
            await self._close_run_failed(job, run_id, str(exc), guard_locals=locals())
        finally:
            try:
                await self.api.set_agent_status(job.agent_id, "idle", room_id=job.room_id, run_id=run_id)
            except Exception:  # noqa: BLE001
                logger.debug("gagal reset status agent", exc_info=True)

    async def _close_run(self, run_ctx: RunContext, *, status: str, error: str | None) -> None:
        api = run_ctx.api
        if run_ctx.events:
            try:
                await api.append_events(run_ctx.run_id, run_ctx.events)
            except Exception:  # noqa: BLE001
                logger.warning("gagal menyimpan agent_events", exc_info=True)

        await api.update_run(
            run_ctx.run_id,
            status=status,
            step_count=run_ctx.budget.steps,
            tool_calls=run_ctx.tool_calls,
            state={
                "budget": run_ctx.budget.snapshot(),
                "provider": _provider_summary(run_ctx.context),
            },
            result=(run_ctx.result or "")[:8000] or None,
            error=error,
            duration_ms=run_ctx.duration_ms,
        )
        await run_ctx.publisher.run_finished(
            run_ctx.room_id,
            run_ctx.job.agent_id,
            run_ctx.run_id,
            status,
            duration_ms=run_ctx.duration_ms,
            error=error,
        )

    async def _close_run_failed(
        self,
        job: Job,
        run_id: str,
        error: str,
        *,
        status: str = "failed",
        guard_locals: dict[str, Any] | None = None,
    ) -> None:
        if not run_id:
            await self.publisher.run_finished(job.room_id, job.agent_id, "", status, error=error)
            return

        guard = (guard_locals or {}).get("guard")
        run_ctx = (guard_locals or {}).get("run_ctx")

        events = run_ctx.events if run_ctx else []
        if events:
            try:
                await self.api.append_events(run_id, events)
            except Exception:  # noqa: BLE001
                logger.debug("gagal menyimpan event saat gagal", exc_info=True)

        try:
            await self.api.update_run(
                run_id,
                status=status,
                step_count=guard.steps if guard else 0,
                tool_calls=run_ctx.tool_calls if run_ctx else [],
                state={"budget": guard.snapshot()} if guard else {},
                error=error[:1000],
                duration_ms=run_ctx.duration_ms if run_ctx else None,
            )
        except Exception:  # noqa: BLE001
            logger.warning("gagal menutup run %s", run_id, exc_info=True)

        await self.publisher.run_finished(job.room_id, job.agent_id, run_id, status, error=error)


def _provider_summary(context: dict[str, Any]) -> dict[str, Any]:
    provider = context.get("provider") or {}
    return {
        "kind": provider.get("kind"),
        "model": provider.get("model"),
        "source": provider.get("source"),
    }
