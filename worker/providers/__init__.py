"""Registry provider LLM.

`get_provider(kind, ...)` adalah satu-satunya cara orchestrator membuat
provider, sehingga penambahan vendor baru cukup di sini.
"""

from __future__ import annotations

from .anthropic import AnthropicProvider
from .base import ChatChunk, Message, Provider, ProviderError, ToolSpec
from .gemini import GeminiProvider
from .openai import OpenAIProvider

__all__ = [
    "AnthropicProvider",
    "ChatChunk",
    "GeminiProvider",
    "Message",
    "OpenAIProvider",
    "Provider",
    "ProviderError",
    "ToolSpec",
    "get_provider",
]

_LOCAL_NO_TOOLS = {"llama3.1", "llama3", "qwen2.5", "mistral", "phi3"}


def get_provider(
    kind: str,
    *,
    api_key: str,
    base_url: str | None = None,
    timeout: float = 180.0,
    model: str | None = None,
) -> Provider:
    """Buat provider konkret berdasarkan `kind`.

    Raises:
        ProviderError: bila `kind` tidak didukung atau api_key kosong.
    """
    if not api_key:
        raise ProviderError(f"Kredensial untuk provider '{kind}' kosong.")

    normalized = (kind or "").lower()

    if normalized == "openai":
        return OpenAIProvider(api_key, base_url, name="openai", timeout=timeout)

    if normalized == "openai_compatible":
        return OpenAIProvider(api_key, base_url, name="openai_compatible", timeout=timeout)

    if normalized == "local":
        # Model kecil lokal sering tidak mendukung native tool calling —
        # biarkan orchestrator memakai jalur "tool via teks".
        tool_support = bool(model) and not any(m in (model or "") for m in _LOCAL_NO_TOOLS)
        return OpenAIProvider(
            api_key,
            base_url,
            name="local",
            timeout=timeout,
            tool_support=tool_support,
        )

    if normalized == "anthropic":
        return AnthropicProvider(api_key, base_url, timeout=timeout)

    if normalized == "gemini":
        return GeminiProvider(api_key, base_url, timeout=timeout)

    raise ProviderError(f"Provider '{kind}' belum didukung.")
