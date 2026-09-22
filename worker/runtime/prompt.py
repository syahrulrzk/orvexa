"""Penyusunan prompt agent dari konteks run.

System prompt dibangun berlapis: identitas Orvexa → persona agent → skill →
aturan room/tool → konteks waktu (WIB).
"""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from providers import Message, ToolSpec

APP_TIMEZONE = "Asia/Jakarta"

BASE_INSTRUCTIONS = """Kamu adalah bagian dari **Orvexa**, AI Infrastructure Department: \
tim agent yang bekerja bersama manusia di dalam *room* kolaborasi.

Aturan kerja:
- Balas ringkas, teknis, dan bisa langsung dieksekusi. Hindari basa-basi.
- Gunakan markdown (bullet, tabel, blok kode) bila membantu kejelasan.
- Bila diminta analisis/troubleshooting, sebutkan **langkah diagnosis** dan \
**perintah/konfigurasi konkret**, bukan saran umum.
- Jangan mengarang data. Kalau informasi kurang, sebutkan asumsi secara eksplisit \
atau minta detail tambahan.
- Jangan pernah menuliskan kredensial, token, atau password.
- Bahasa: ikuti bahasa pengguna (default Bahasa Indonesia).
- Operasi yang berisiko (ubah produksi, hapus, restart layanan) **harus** \
diajukan sebagai approval, bukan langsung dieksekusi.
"""


def _now_wib() -> str:
    return datetime.now(ZoneInfo(APP_TIMEZONE)).strftime("%Y-%m-%d %H:%M WIB")


def _persona(context: dict[str, Any]) -> str:
    agent = context["agent"]
    lines = [f"# Peranmu: {agent.get('display_name') or agent.get('name')}"]
    if agent.get("role"):
        lines.append(f"Jabatan: {agent['role']}")
    if agent.get("description"):
        lines.append(f"Deskripsi: {agent['description']}")
    if agent.get("objective"):
        lines.append(f"Tujuan utama: {agent['objective']}")
    if agent.get("system_prompt"):
        lines.append("\nInstruksi khusus dari admin:\n" + str(agent["system_prompt"]))
    return "\n".join(lines)


def _skills(context: dict[str, Any]) -> str:
    skills = context.get("skills") or []
    if not skills:
        return ""
    parts = []
    for s in skills:
        hint = f" — {s['prompt_hint']}" if s.get("prompt_hint") else ""
        parts.append(f"- {s['name']}{hint}")
    return "# Keahlian yang kamu kuasai\n" + "\n".join(parts)


def _room_block(context: dict[str, Any]) -> str:
    room = context.get("room")
    if not room:
        return ""

    members = context.get("members") or []
    humans = [m["name"] for m in members if m["kind"] == "human"]

    lines = [f"# Room: {room['name']} ({room['type']})"]
    if room.get("topic"):
        lines.append(f"Topik: {room['topic']}")
    if humans:
        lines.append(f"Manusia di room ini: {', '.join(humans)}")
    agent_members = [m for m in members if m["kind"] == "agent" and m["id"] != context["agent"]["id"]]
    if agent_members:
        lines.append("Agent lain di room ini (nama — id — bisa didelegasi lewat tool `agent.delegate`):")
        for m in agent_members:
            lines.append(f"- {m['name']} — {m['id']}")

    return "\n".join(lines)


def _tools_block(tools: list[ToolSpec], native: bool) -> str:
    if not tools:
        return ""

    listing = "\n".join(
        f"- `{t.name}`: {t.description}\n  Parameter JSON Schema: {json.dumps(t.parameters)}"
        for t in tools
    )

    if native:
        return (
            "# Tool yang tersedia\n"
            "Panggil tool lewat mekanisme function calling. Jangan menulis JSON tool call "
            "di dalam jawaban teks.\n" + listing
        )

    # Fallback untuk model yang tidak mendukung function calling bawaan.
    return (
        "# Tool yang tersedia (mode teks)\n"
        "Model ini tidak mendukung function calling native. Untuk memakai tool, balas "
        "**hanya** dengan satu blok JSON seperti contoh:\n\n"
        '{"tool": "room.post", "args": {"content": "..."}}\n\n'
        "Setelah blok JSON itu, tunggu hasilnya di pesan berikutnya. Bila tidak perlu tool, "
        "jawab seperti biasa.\n\n" + listing
    )


def _memories_block(context: dict[str, Any]) -> str:
    memories = context.get("memories") or []
    if not memories:
        return ""
    lines = ["# Ingatan relevan (dari run sebelumnya)"]
    for m in memories:
        lines.append(f"- [{m.get('scope')}] {m.get('content')}")
    lines.append(
        "Gunakan ingatan ini sebagai konteks. Simpan fakta penting baru lewat tool `memory.save`."
    )
    return "\n".join(lines)


def build_system_prompt(context: dict[str, Any], tools: list[ToolSpec], native_tools: bool) -> str:
    agent = context["agent"]
    permissions = context.get("permissions") or []

    blocks = [
        BASE_INSTRUCTIONS,
        _persona(context),
        f"# Waktu sekarang\n{_now_wib()} (Asia/Jakarta)",
        _skills(context),
        _room_block(context),
        _memories_block(context),
        _tools_block(tools, native_tools),
    ]

    if permissions:
        rule = "\n".join(f"- {p['permission']}: {p['effect']}" for p in permissions)
        blocks.append(
            "# Batas izin\n"
            "Effect `approval_required` berarti aksi harus diajukan sebagai approval ke manusia "
            "dan tidak boleh diklaim sudah dilakukan.\n" + rule
        )

    trigger = context.get("trigger") or {}
    if trigger.get("kind") == "delegation":
        blocks.append(
            "# Sub-tugas yang didelegasikan kepadamu\n"
            f"Dari agent koordinator: {trigger.get('task') or '-'}\n\n"
            "Kerjakan sub-tugas ini secara mandiri. Gunakan tool yang tersedia bila membantu, "
            "lalu laporkan hasilnya langsung di room (bukan ke agent koordinator)."
        )
    elif trigger.get("text"):
        blocks.append(
            "# Permintaan yang harus kamu tanggapi\n"
            f"Dari manusia: {trigger['text']}\n\n"
            "Jawab permintaan ini langsung (tanpa mengulang pertanyaannya)."
        )

    return "\n\n".join(b for b in blocks if b.strip())


def build_messages(context: dict[str, Any], native_tools: bool) -> list[Message]:
    tools = [ToolSpec(name=t["key"], description=t["description"], parameters=t["parameters"]) for t in context.get("tools") or []]
    messages: list[Message] = [
        Message(role="system", content=build_system_prompt(context, tools, native_tools))
    ]

    history = context.get("history") or []
    agent_id = context["agent"]["id"]

    for item in history:
        role = "assistant" if item.get("author_type") == "agent" else "user"
        name = item.get("author_name") or "Unknown"
        content = item.get("content") or ""
        if not content:
            continue
        if role == "assistant":
            messages.append(Message(role="assistant", content=content, name=name))
        else:
            messages.append(Message(role="user", content=f"{name}: {content}"))
        _ = agent_id

    if len(messages) == 1:
        messages.append(Message(role="user", content="Mulai bekerja sesuai tujuanmu."))

    return messages


def render_tool_result(tool_key: str, ok: bool, result: Any, error: str | None = None) -> str:
    if ok:
        return f"Hasil `{tool_key}`:\n{json.dumps(result, ensure_ascii=False, default=str)}"
    return f"Tool `{tool_key}` gagal: {error or 'unknown error'}"
