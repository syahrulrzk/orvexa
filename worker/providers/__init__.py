"""Registry provider.

Implementasi konkret (openai.py, anthropic.py, gemini.py, ...) ditambahkan
pada Fase 3. Modul ini menyediakan factory sehingga orchestrator cukup
memanggil `get_provider(kind, ...)`.
"""

from __future__ import annotations

from .base import ChatChunk, Message, Provider, ProviderError, ToolSpec

__all__ = ["ChatChunk", "Message", "Provider", "ProviderError", "ToolSpec", "get_provider"]


def get_provider(kind: str, **kwargs: object) -> Provider:
    """Buat instance provider berdasarkan `kind`.

    Raises:
        NotImplementedError: bila provider belum diimplementasikan.
    """
    # Placeholder sampai Fase 3: provider konkret akan didaftarkan di sini.
    raise NotImplementedError(f"Provider '{kind}' belum diimplementasikan (Fase 3).")
