"""Strategi orkestrasi agent (pluggable).

Lihat ADR-007 di docs/ARCHITECTURE.md: MVP memakai loop sendiri, tetapi
dibuat swappable supaya LangGraph / Pydantic AI / LlamaIndex Workflows /
OpenAI Agents SDK bisa ditambahkan nanti TANPA rewrite.

Cara menambah strategi baru:
    class LangGraphStrategy:  # name = "langgraph"
        async def run(self, job, runtime) -> None: ...
    orchestrator = Orchestrator(publisher, strategy=LangGraphStrategy(...))
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:
    from .loop import Job


@runtime_checkable
class Strategy(Protocol):
    """Kontrak strategi. `runtime` memberi akses ke db/redis/tools orchestrator."""

    name: str

    async def run(self, job: "Job", runtime: Any) -> None:
        ...


class DefaultStrategy:
    """Loop sederhana: observe → plan → act → reflect.

    Implementasi penuh (LLM call, RAG, tool execution) diisi pada Fase 3.
    """

    name = "default"

    def __init__(self, publisher: Any) -> None:
        self._publisher = publisher

    async def run(self, job: "Job", runtime: Any) -> None:
        _ = runtime  # dipakai pada Fase 3 (db, redis, tool registry)
        await self._publisher.agent_status(job, "thinking")
        # TODO(Fase 3): muat konteks → LLM → tool → persist run/events
        await self._publisher.agent_status(job, "idle")
