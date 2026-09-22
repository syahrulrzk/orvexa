"""Klien internal API Next.js.

Worker **tidak** menulis ke PostgreSQL secara langsung: semua persistensi
(run, event, pesan, usage, tool) lewat `/api/internal/*` supaya validasi,
permission, dan publikasi event realtime tetap satu pintu di web.

Lihat docs/API_SPEC.md §7.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger("orvexa.runtime.api")


class InternalAPIError(RuntimeError):
    def __init__(self, status: int, path: str, body: str) -> None:
        super().__init__(f"Internal API {path} gagal (HTTP {status}): {body[:300]}")
        self.status = status
        self.path = path
        self.body = body


class InternalAPI:
    def __init__(self, base_url: str, token: str, *, timeout: float = 30.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "InternalAPI":
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=self._timeout,
            headers={"Authorization": f"Bearer {self._token}"},
        )
        return self

    async def __aexit__(self, *_exc: object) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            raise RuntimeError("InternalAPI belum dibuka — pakai `async with`.")
        return self._client

    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        resp = await self.client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            raise InternalAPIError(resp.status_code, path, resp.text)
        body = resp.json()
        return body.get("data", body)

    # ---------------- context ----------------
    async def get_context(
        self,
        agent_id: str,
        room_id: str | None = None,
        trigger_message_id: str | None = None,
        history_limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if room_id:
            params["room_id"] = room_id
        if trigger_message_id:
            params["trigger_message_id"] = trigger_message_id
        if history_limit:
            params["history_limit"] = history_limit
        return await self._request("GET", f"/api/internal/agents/{agent_id}/context", params=params)

    # ---------------- runs ----------------
    async def create_run(
        self,
        *,
        agent_id: str,
        room_id: str | None,
        trigger_kind: str,
        trigger_ref_id: str | None = None,
        parent_run_id: str | None = None,
        project_id: str | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/internal/runs",
            json={
                "agent_id": agent_id,
                "room_id": room_id,
                "trigger_kind": trigger_kind,
                "trigger_ref_id": trigger_ref_id,
                "parent_run_id": parent_run_id,
                "project_id": project_id,
            },
        )

    async def update_run(self, run_id: str, **fields: Any) -> dict[str, Any]:
        return await self._request("PATCH", f"/api/internal/runs/{run_id}", json=fields)

    async def append_events(self, run_id: str, events: list[dict[str, Any]]) -> dict[str, Any]:
        return await self._request(
            "POST", f"/api/internal/runs/{run_id}/events", json={"events": events}
        )

    # ---------------- messages ----------------
    async def post_message(
        self,
        run_id: str,
        content: str,
        *,
        kind: str = "text",
        thread_root_id: str | None = None,
        meta: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            f"/api/internal/runs/{run_id}/messages",
            json={
                "content": content,
                "kind": kind,
                "thread_root_id": thread_root_id,
                "meta": meta or {},
            },
        )

    # ---------------- agent ----------------
    async def set_agent_status(
        self, agent_id: str, status: str, *, room_id: str | None = None, run_id: str | None = None
    ) -> dict[str, Any]:
        return await self._request(
            "PATCH",
            f"/api/internal/agents/{agent_id}",
            json={"status": status, "room_id": room_id, "run_id": run_id},
        )

    # ---------------- usage ----------------
    async def record_usage(
        self,
        *,
        company_id: str,
        agent_id: str,
        run_id: str | None,
        input_tokens: int,
        output_tokens: int,
        cached_tokens: int = 0,
        estimated_cost: float = 0.0,
        latency_ms: int | None = None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/internal/usage",
            json={
                "company_id": company_id,
                "agent_id": agent_id,
                "run_id": run_id,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cached_tokens": cached_tokens,
                "estimated_cost": estimated_cost,
                "latency_ms": latency_ms,
            },
        )

    # ---------------- tools ----------------
    async def execute_tool(
        self,
        *,
        tool_key: str,
        args: dict[str, Any],
        company_id: str,
        agent_id: str,
        room_id: str | None,
        run_id: str | None,
    ) -> dict[str, Any]:
        return await self._request(
            "POST",
            "/api/internal/tools/execute",
            json={
                "tool_key": tool_key,
                "args": args,
                "company_id": company_id,
                "agent_id": agent_id,
                "room_id": room_id,
                "run_id": run_id,
            },
        )
