"""Provider Google Gemini (Generative Language API) — streaming SSE."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from .base import ChatChunk, Message, ProviderError, ToolSpec

logger = logging.getLogger("orvexa.provider.gemini")

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"


def _to_wire(messages: list[Message]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    system: dict[str, Any] | None = None
    contents: list[dict[str, Any]] = []

    for m in messages:
        if m.role == "system":
            system = {"parts": [{"text": m.content}]}
            continue
        role = "model" if m.role == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": m.content}]})

    return system, contents


def _tools_wire(tools: list[ToolSpec] | None) -> list[dict[str, Any]] | None:
    if not tools:
        return None
    return [
        {
            "functionDeclarations": [
                {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters or {"type": "object", "properties": {}},
                }
                for t in tools
            ]
        }
    ]


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, base_url: str | None = None, *, timeout: float = 180.0) -> None:
        self._api_key = api_key
        self._base_url = (base_url or DEFAULT_BASE_URL).rstrip("/")
        self._timeout = timeout

    def supports(self, capability: str) -> bool:
        return capability in {"chat", "tools", "vision", "embedding"}

    async def chat(
        self,
        messages: list[Message],
        model: str,
        tools: list[ToolSpec] | None = None,
        stream: bool = True,
        **params: Any,
    ) -> AsyncIterator[ChatChunk]:
        system, contents = _to_wire(messages)

        payload: dict[str, Any] = {"contents": contents}
        if system:
            payload["systemInstruction"] = system
        if tools:
            payload["tools"] = _tools_wire(tools)

        generation_config: dict[str, Any] = {}
        if params.get("temperature") is not None:
            generation_config["temperature"] = params["temperature"]
        if params.get("max_tokens") is not None:
            generation_config["maxOutputTokens"] = params["max_tokens"]
        if generation_config:
            payload["generationConfig"] = generation_config

        method = "streamGenerateContent" if stream else "generateContent"
        url = f"{self._base_url}/models/{model}:{method}"
        query = {"alt": "sse", "key": self._api_key} if stream else {"key": self._api_key}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                async with client.stream(
                    "POST", url, params=query, json=payload
                ) as resp:
                    if resp.status_code >= 400:
                        body = (await resp.aread()).decode("utf-8", "replace")[:500]
                        raise ProviderError(f"HTTP {resp.status_code}: {body}")

                    if not stream:
                        data = json.loads((await resp.aread()) or b"{}")
                        yield self._parse_payload(data)
                        return

                    async for raw in resp.aiter_lines():
                        if not raw or not raw.startswith("data:"):
                            continue
                        data = raw[5:].strip()
                        if not data:
                            continue
                        try:
                            yield self._parse_payload(json.loads(data))
                        except json.JSONDecodeError:
                            continue
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi Gemini: {exc}") from exc

    def _parse_payload(self, data: dict[str, Any]) -> ChatChunk:
        candidates = data.get("candidates") or []
        text_parts: list[str] = []
        tool_calls: list[dict[str, Any]] = []
        finish: str | None = None

        if candidates:
            candidate = candidates[0]
            for part in (candidate.get("content") or {}).get("parts") or []:
                if part.get("text"):
                    text_parts.append(str(part["text"]))
                if part.get("functionCall"):
                    tool_calls.append(part["functionCall"])
            reason = candidate.get("finishReason")
            if reason and reason not in {"FINISH_REASON_UNSPECIFIED"}:
                finish = "tool_calls" if tool_calls else "stop"

        usage = data.get("usageMetadata") or {}
        usage_payload = None
        if usage:
            usage_payload = {
                "input_tokens": int(usage.get("promptTokenCount") or 0),
                "output_tokens": int(usage.get("candidatesTokenCount") or 0),
                "cached_tokens": int(usage.get("cachedContentTokenCount") or 0),
            }

        chunk = ChatChunk(
            delta="".join(text_parts),
            finish_reason=finish,
            usage=usage_payload,
        )
        if tool_calls:
            call = tool_calls[0]
            chunk.tool_call = {
                "index": 0,
                "id": None,
                "name": call.get("name"),
                "arguments": json.dumps(call.get("args") or {}),
            }
        return chunk

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        url = f"{self._base_url}/models/{model}:batchEmbedContents"
        requests = [{"model": f"models/{model}", "content": {"parts": [{"text": t}]}} for t in texts]
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                resp = await client.post(
                    url, params={"key": self._api_key}, json={"requests": requests}
                )
                if resp.status_code >= 400:
                    raise ProviderError(f"HTTP {resp.status_code}: {resp.text[:500]}")
                data = resp.json()
        except httpx.HTTPError as exc:
            raise ProviderError(f"Gagal menghubungi Gemini: {exc}") from exc

        return [item["values"] for item in data.get("embeddings", [])]
