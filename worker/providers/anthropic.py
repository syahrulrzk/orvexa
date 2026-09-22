"""Provider Anthropic (Claude) — Messages API dengan streaming SSE."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from .base import ChatChunk, Message, ProviderError, ToolSpec

logger = logging.getLogger("orvexa.provider.anthropic")

DEFAULT_BASE_URL = "https://api.anthropic.com/v1"
API_VERSION = "2023-06-01"


def _split_system(messages: list[Message]) -> tuple[str, list[dict[str, Any]]]:
    """Anthropic memisahkan system prompt dari daftar pesan."""
    system_parts: list[str] = []
    wire: list[dict[str, Any]] = []

    for m in messages:
        if m.role == "system":
            system_parts.append(m.content)
            continue
        if m.role == "tool":
            wire.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": m.tool_call_id or "",
                            "content": m.content,
                        }
                    ],
                }
            )
            continue
        wire.append({"role": m.role, "content": m.content})

    return "\n\n".join(system_parts), wire


def _tools_wire(tools: list[ToolSpec] | None) -> list[dict[str, Any]] | None:
    if not tools:
        return None
    return [
        {
            "name": t.name,
            "description": t.description,
            "input_schema": t.parameters or {"type": "object", "properties": {}},
        }
        for t in tools
    ]


class AnthropicProvider:
    name = "anthropic"

    def __init__(self, api_key: str, base_url: str | None = None, *, timeout: float = 180.0) -> None:
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout

    def supports(self, capability: str) -> bool:
        return capability in {"chat", "tools", "vision"}

    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self._api_key,
            "anthropic-version": API_VERSION,
            "Content-Type": "application/json",
        }

    async def chat(
        self,
        messages: list[Message],
        model: str,
        tools: list[ToolSpec] | None = None,
        stream: bool = True,
        **params: Any,
    ) -> AsyncIterator[ChatChunk]:
        system, wire = _split_system(messages)

        payload: dict[str, Any] = {
            "model": model,
            "messages": wire,
            "max_tokens": int(params.pop("max_tokens", 4096)),
            "stream": True,
        }
        if system:
            payload["system"] = system
        if tools:
            payload["tools"] = _tools_wire(tools)
        if params.get("temperature") is not None:
            payload["temperature"] = params["temperature"]

        url = f"{self._base_url}/messages"

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream("POST", url, headers=self._headers(), json=payload) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "replace")[:500]
                        raise ProviderError(f"HTTP {resp.status_code}: {body}")

                    async for raw in resp.aiter_lines():
                        if not raw or not raw.startswith("data:"):
                            continue
                        data = raw[5:].strip()
                        if not data:
                            continue
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for chunk in self._parse_event(event):
                            yield chunk
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi Anthropic: {exc}") from exc

    def _parse_event(self, event: dict[str, Any]) -> list[ChatChunk]:
        chunks: list[ChatChunk] = []
        etype = event.get("type")

        if etype == "content_block_delta":
            delta = event.get("delta") or {}
            if delta.get("type") == "text_delta" and delta.get("text"):
                chunks.append(ChatChunk(delta=str(delta["text"])))
            elif delta.get("type") == "thinking_delta" and delta.get("thinking"):
                chunks.append(ChatChunk(reasoning=str(delta["thinking"])))
            elif delta.get("type") == "input_json_delta":
                chunks.append(
                    ChatChunk(
                        tool_call={
                            "index": int(event.get("index") or 0),
                            "arguments": delta.get("partial_json") or "",
                        }
                    )
                )
            return chunks

        if etype == "content_block_start":
            block = event.get("content_block") or {}
            if block.get("type") == "tool_use":
                chunks.append(
                    ChatChunk(
                        tool_call={
                            "index": int(event.get("index") or 0),
                            "id": block.get("id"),
                            "name": block.get("name"),
                            "arguments": "",
                        }
                    )
                )
            return chunks

        if etype == "message_delta":
            delta = event.get("delta") or {}
            usage = event.get("usage") or {}
            if delta.get("stop_reason"):
                reason = "tool_calls" if delta["stop_reason"] == "tool_use" else "stop"
                chunks.append(ChatChunk(finish_reason=reason))
            if usage:
                chunks.append(
                    ChatChunk(
                        usage={
                            "input_tokens": int(usage.get("input_tokens") or 0),
                            "output_tokens": int(usage.get("output_tokens") or 0),
                            "cached_tokens": int(usage.get("cache_read_input_tokens") or 0),
                        }
                    )
                )
            return chunks

        if etype == "message_start":
            usage = (event.get("message") or {}).get("usage") or {}
            if usage:
                chunks.append(
                    ChatChunk(
                        usage={
                            "input_tokens": int(usage.get("input_tokens") or 0),
                            "output_tokens": int(usage.get("output_tokens") or 0),
                            "cached_tokens": int(usage.get("cache_read_input_tokens") or 0),
                        }
                    )
                )
        return chunks

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        raise ProviderError("Anthropic tidak menyediakan endpoint embedding — pakai provider lain.")
