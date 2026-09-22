"""Registry tool internal.

Tool logic sesungguhnya diimplementasikan pada Fase 3/4. Di sini kita
mendefinisikan metadata + guardrail sehingga pemanggilan tool selalu
melewati pemeriksaan permission dan approval.
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
