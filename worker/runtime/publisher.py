"""Publisher event room dari worker ke Redis Pub/Sub.

Web (SSE gateway) hanya meneruskan, jadi bentuk event **harus** sama dengan
`apps/web/src/lib/events.ts`. Semua event bersifat ephemeral; yang perlu
disimpan tetap lewat internal API.
"""

from __future__ import annotations

import json
import logging
import secrets
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("orvexa.runtime.publisher")

_ROOM_CHANNEL = "room.events.{room_id}"


def new_id(prefix: str) -> str:
    """ID ber-prefix mengikuti konvensi `apps/web/src/lib/ids.ts`."""
    return f"{prefix}_{secrets.token_hex(13)}"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class RoomPublisher:
    def __init__(self, redis: Any) -> None:
        self._redis = redis

    async def emit(
        self,
        room_id: str | None,
        event_type: str,
        payload: dict[str, Any] | None = None,
        *,
        agent_id: str | None = None,
        run_id: str | None = None,
    ) -> None:
        if not room_id:
            return

        event = {
            "event_id": new_id("evt"),
            "room_id": room_id,
            "type": event_type,
            "agent_id": agent_id,
            "run_id": run_id,
            "payload": payload or {},
            "ts": _now_iso(),
        }
        try:
            await self._redis.publish(_ROOM_CHANNEL.format(room_id=room_id), json.dumps(event))
        except Exception:  # noqa: BLE001 - realtime tidak boleh mematikan run
            logger.exception("gagal publish event %s ke room %s", event_type, room_id)

    # -- helper event yang dipakai orchestrator --

    async def run_started(self, room_id: str | None, agent_id: str, run_id: str) -> None:
        await self.emit(room_id, "agent.run.started", {}, agent_id=agent_id, run_id=run_id)

    async def run_finished(
        self, room_id: str | None, agent_id: str, run_id: str, status: str, **extra: Any
    ) -> None:
        await self.emit(
            room_id,
            "agent.run.finished",
            {"status": status, **extra},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def message_started(
        self, room_id: str | None, agent_id: str, run_id: str, message_key: str, agent_name: str
    ) -> None:
        await self.emit(
            room_id,
            "agent.message.started",
            {"message_key": message_key, "agent_name": agent_name},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def token(
        self,
        room_id: str | None,
        agent_id: str,
        run_id: str,
        message_key: str,
        delta: str,
    ) -> None:
        await self.emit(
            room_id,
            "agent.token",
            {"message_key": message_key, "delta": delta},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def reasoning(
        self, room_id: str | None, agent_id: str, run_id: str, message_key: str, delta: str
    ) -> None:
        await self.emit(
            room_id,
            "agent.reasoning",
            {"message_key": message_key, "delta": delta},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def message_completed(
        self, room_id: str | None, agent_id: str, run_id: str, message_key: str
    ) -> None:
        await self.emit(
            room_id,
            "agent.message.completed",
            {"message_key": message_key},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def tool_call(
        self,
        room_id: str | None,
        agent_id: str,
        run_id: str,
        tool_key: str,
        args: dict[str, Any],
    ) -> None:
        await self.emit(
            room_id,
            "tool.call",
            {"tool_key": tool_key, "args": args},
            agent_id=agent_id,
            run_id=run_id,
        )

    async def tool_result(
        self, room_id: str | None, agent_id: str, run_id: str, tool_key: str, ok: bool, result: Any
    ) -> None:
        await self.emit(
            room_id,
            "tool.result",
            {"tool_key": tool_key, "ok": ok, "result": result},
            agent_id=agent_id,
            run_id=run_id,
        )
