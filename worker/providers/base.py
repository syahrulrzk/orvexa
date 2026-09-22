"""Abstraksi provider LLM.

Semua provider (OpenAI, Anthropic, Gemini, OpenAI-compatible, local)
mengimplementasikan protokol di sini sehingga agent tidak terikat vendor.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, AsyncIterator, Protocol, runtime_checkable


@dataclass
class Message:
    role: str  # system | user | assistant | tool
    content: str
    name: str | None = None
    tool_call_id: str | None = None


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass
class ChatChunk:
    """Potongan respons streaming."""

    delta: str = ""
    tool_call: dict[str, Any] | None = None
    finish_reason: str | None = None
    usage: dict[str, int] | None = None


@runtime_checkable
class Provider(Protocol):
    """Kontrak provider. Implementasi konkret ada di modul sebelah."""

    name: str

    async def chat(
        self,
        messages: list[Message],
        model: str,
        tools: list[ToolSpec] | None = None,
        stream: bool = True,
    ) -> AsyncIterator[ChatChunk]:
        """Kirim chat completion, kembalikan stream chunk bila stream=True."""
        ...

    async def embed(self, texts: list[str], model: str) -> list[list[float]]:
        """Buat embedding untuk sekumpulan teks."""
        ...

    def supports(self, capability: str) -> bool:
        """Cek dukungan capability: chat | tools | vision | embedding."""
        ...


class ProviderError(RuntimeError):
    """Error umum dari provider (rate limit, auth, timeout, dsb)."""
