"""Registry tool internal (metadata lokal).

Sejak Fase 3, **sumber kebenaran** spesifikasi tool adalah web
(`apps/web/src/lib/tools.ts`) dan dikirim ke worker lewat
`GET /api/internal/agents/:id/context`. Registry ini tinggal dipakai sebagai
cermin lokal untuk fallback/offline check sehingga permission dan approval
selalu dapat diverifikasi di sisi worker juga.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ToolDefinition:
    key: str                      # mis. "task.create"
    description: str
    permission: str               # permission key, mis. "task.create"
    requires_approval: bool = False
    handler: Callable[..., Any] | None = None
    parameters: dict[str, Any] = field(default_factory=dict)


# Registry dasar. Tool MCP didaftarkan dinamis dari tabel mcp_tools.
REGISTRY: dict[str, ToolDefinition] = {}


def register(tool: ToolDefinition) -> None:
    REGISTRY[tool.key] = tool


def get_tool(key: str) -> ToolDefinition | None:
    return REGISTRY.get(key)


def _bootstrap_builtin() -> None:
    """Tool builtin awal (Fase 3 akan mengisi handler sebenarnya)."""
    register(ToolDefinition(
        key="agent.delegate",
        description="Delegasikan sub-tugas ke agent spesialis lain.",
        permission="agent.delegate",
    ))
    register(ToolDefinition(
        key="memory.save",
        description="Simpan fakta/preferensi penting sebagai ingatan jangka panjang.",
        permission="memory.write",
    ))
    register(ToolDefinition(
        key="kb.search",
        description="Cari informasi di Knowledge Base company (RAG).",
        permission="knowledge.read",
    ))
    register(ToolDefinition(
        key="task.create",
        description="Membuat task baru di project/room.",
        permission="task.create",
    ))
    register(ToolDefinition(
        key="room.post",
        description="Mengirim pesan ke room.",
        permission="room.write",
    ))
    register(ToolDefinition(
        key="doc.generate",
        description="Menghasilkan dokumen (MOP/SOP/RCA/report).",
        permission="document.create",
    ))


_bootstrap_builtin()
