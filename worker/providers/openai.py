"""Provider OpenAI + OpenAI-compatible + LLM lokal.

Satu implementasi melayani tiga `kind`:
- ``openai``               → api.openai.com
- ``openai_compatible``    → Groq / Together / OpenRouter / vLLM / dsb.
- ``local``                → Ollama / llama.cpp / LM Studio (endpoint /v1)

Semuanya memakai endpoint ``POST {base_url}/chat/completions`` dengan
streaming SSE.
"""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from .base import ChatChunk, Message, ProviderError, ToolSpec

logger = logging.getLogger("orvexa.provider.openai")

DEFAULT_BASE_URL = "https://api.openai.com/v1"


def _to_wire(messages: list[Message]) -> list[dict[str, Any]]:
    wire: list[dict[str, Any]] = []
    for m in messages:
        item: dict[str, Any] = {"role": m.role, "content": m.content}
        if m.name:
            item["name"] = m.name
        if m.tool_call_id:
            item["tool_call_id"] = m.tool_call_id
        wire.append(item)
    return wire


def _tools_wire(tools: list[ToolSpec] | None) -> list[dict[str, Any]] | None:
    if not tools:
        return None
    return [
        {
            "type": "function",
            "function": {
                "name": t.name,
                "description": t.description,
                "parameters": t.parameters or {"type": "object", "properties": {}},
            },
        }
        for t in tools
    ]


class OpenAIProvider:
    """Chat Completion API (OpenAI & yang kompatibel)."""

    def __init__(
        self,
        api_key: str,
        base_url: str | None = None,
        *,
        name: str = "openai",
        timeout: float = 180.0,
        tool_support: bool = True,
        extra_headers: dict[str, str] | None = None,
    ) -> None:
        self.name = name
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout
        self._tool_support = tool_support
        self._extra_headers = extra_headers or {}

    def supports(self, capability: str) -> bool:
        if capability == "tools":
            return self._tool_support
        return capability in {"chat", "vision", "embedding"}

    def _headers(self) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            **self._extra_headers,
        }
        return headers

    async def chat(
        self,
        messages: list[Message],
        model: str,
        tools: list[ToolSpec] | None = None,
        stream: bool = True,
        **params: Any,
    ) -> AsyncIterator[ChatChunk]:
        payload: dict[str, Any] = {
            "model": model,
            "messages": _to_wire(messages),
        }
        if tools and self._tool_support:
            payload["tools"] = _tools_wire(tools)
            payload["tool_choice"] = params.pop("tool_choice", "auto")
        payload.update({k: v for k, v in params.items() if v is not None})

        if not stream:
            yield await self._chat_once(payload)
            return

        payload["stream"] = True
        # Usage hanya dikirim kalau diminta (didukung OpenAI & mayoritas server).
        payload.setdefault("stream_options", {"include_usage": True})

        url = f"{self._base_url}/chat/completions"
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
                        if data == "[DONE]":
                            break
                        try:
                            event = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        for chunk in self._parse_event(event):
                            yield chunk
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi provider: {exc}") from exc

    def _parse_event(self, event: dict[str, Any]) -> list[ChatChunk]:
        chunks: list[ChatChunk] = []

        usage = event.get("usage")
        if usage:
            chunks.append(
                ChatChunk(
                    usage={
                        "input_tokens": int(usage.get("prompt_tokens") or 0),
                        "output_tokens": int(usage.get("completion_tokens") or 0),
                        "cached_tokens": int(
                            (usage.get("prompt_tokens_details") or {}).get("cached_tokens") or 0
                        ),
                    }
                )
            )

        choices = event.get("choices") or []
        if not choices:
            return chunks

        choice = choices[0]
        delta = choice.get("delta") or {}

        content = delta.get("content")
        if content:
            chunks.append(ChatChunk(delta=str(content)))

        reasoning = delta.get("reasoning_content")
        if reasoning:
            chunks.append(ChatChunk(reasoning=str(reasoning)))

        for call in delta.get("tool_calls") or []:
            chunks.append(
                ChatChunk(
                    tool_call={
                        "index": int(call.get("index") or 0),
                        "id": call.get("id"),
                        "name": (call.get("function") or {}).get("name"),
                        "arguments": (call.get("function") or {}).get("arguments") or "",
                    }
                )
            )

        finish = choice.get("finish_reason")
        if finish:
            chunks.append(ChatChunk(finish_reason=str(finish)))

        return chunks

    async def _chat_once(self, payload: dict[str, Any]) -> ChatChunk:
        url = f"{self._base_url}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(url, headers=self._headers(), json=payload)
                if resp.status_code >= 400:
                    raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:500]}")
                data = resp.json()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi provider: {exc}") from exc

        choices = data.get("choices") or [{}]
        content = (choices[0].get("message") or {}).get("content") or ""
        usage = data.get("usage") or {}
        return ChatChunk(
            delta=content,
            finish_reason="stop",
            usage={
                "input_tokens": int(usage.get("prompt_tokens") or 0),
                "output_tokens": int(usage.get("completion_tokens") or 0),
                "cached_tokens": 0,
            },
        )

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        url = f"{self._base_url}/embeddings"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    url, headers=self._headers(), json={"model": model, "input": texts}
                )
                if resp.status_code >= 400:
                    raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:500]}")
                data = resp.json()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi provider: {exc}") from exc

        return [item["embedding"] for item in sorted(data["data"], key=lambda d: d["index"])]
