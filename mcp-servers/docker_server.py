"""Docker MCP server (F6-03).

Tools (read-only, risiko rendah):
- `containers`    — daftar container + status (`/containers/json`)
- `inspect`       — detail satu container (state, image, network, mounts)
- `images`        — daftar image + ukuran (`/images/json`)
- `disk_usage`    — ringkasan `system/df` (images/containers/volumes)
- `version`       — versi Docker Engine (`/version`)

Transport: Docker Engine API via **unix socket** (`/var/run/docker.sock`) —
tampil sebagai http+unix, bukan endpoint TCP. Server ini perlu di-mount
socket-nya (baca level compose).

Env:
- `DOCKER_SOCKET` (default /var/run/docker.sock)
- `MCP_PORT` (default 9104), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    python3 mcp-servers/docker_server.py   # butuh akses docker.sock
"""

from __future__ import annotations

import json
import os
import socket
from typing import Any

from common import McpServerKit, McpTool, McpToolError, serve

DOCKER_SOCKET = os.environ.get("DOCKER_SOCKET", "/var/run/docker.sock")
API_VERSION = "v1.44"


def _docker_request(method: str, path: str, body: dict[str, Any] | None = None) -> Any:
    """HTTP minimal over unix socket (tanpa dependency httpx-unix)."""
    payload = json.dumps(body).encode() if body else None
    request_lines = [
        f"{method} /{API_VERSION}{path} HTTP/1.1",
        "Host: docker",
        "Content-Type: application/json",
        f"Content-Length: {len(payload) if payload else 0}",
        "Connection: close",
    ]
    raw = ("\r\n".join(request_lines) + "\r\n\r\n").encode() + (payload or b"")

    try:
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as sock:
            sock.settimeout(20.0)
            sock.connect(DOCKER_SOCKET)
            sock.sendall(raw)
            chunks: list[bytes] = []
            while True:
                chunk = sock.recv(65536)
                if not chunk:
                    break
                chunks.append(chunk)
    except (OSError, FileNotFoundError) as exc:
        raise McpToolError(f"Docker socket '{DOCKER_SOCKET}' tidak terjangkau: {exc}") from exc

    data = b"".join(chunks)
    header, _, rest = data.partition(b"\r\n\r\n")
    status_line = header.split(b"\r\n", 1)[0].decode(errors="replace")
    try:
        status = int(status_line.split()[1])
    except (IndexError, ValueError):
        raise McpToolError("Respons Docker tidak valid.")
    # chunked → gabung sederhana
    if b"Transfer-Encoding: chunked" in header:
        body_bytes = _dechunk(rest)
    else:
        body_bytes = rest
    if status >= 400:
        raise McpToolError(f"Docker API HTTP {status}: {body_bytes[:200]!r}")
    if not body_bytes:
        return None
    try:
        return json.loads(body_bytes.decode())
    except json.JSONDecodeError as exc:
        raise McpToolError("Respons Docker bukan JSON.") from exc


def _dechunk(data: bytes) -> bytes:
    out = bytearray()
    while data:
        line, _, data = data.partition(b"\r\n")
        try:
            size = int(line.split(b";")[0], 16)
        except ValueError:
            return bytes(out + data)
        if size == 0:
            break
        out.extend(data[:size])
        data = data[size:]
        # lewati CRLF setelah tiap chunk bila ada
        if data.startswith(b"\r\n"):
            data = data[2:]
    return bytes(out)


def tool_containers(_args: dict[str, Any]) -> Any:
    items = _docker_request("GET", "/containers/json?all=1") or []
    running = sum(1 for c in items if c.get("State") == "running")
    return {
        "total": len(items),
        "running": running,
        "exited": len(items) - running,
        "containers": [
            {
                "id": (c.get("Id") or "")[:12],
                "name": (c.get("Names") or ["?"])[0].lstrip("/"),
                "image": c.get("Image"),
                "state": c.get("State"),
                "status": c.get("Status"),
            }
            for c in items[:50]
        ],
    }


def tool_inspect(args: dict[str, Any]) -> Any:
    container = str(args.get("container") or "").strip()
    if not container:
        raise McpToolError("Argumen `container` wajib diisi (id atau nama).")
    info = _docker_request("GET", f"/containers/{container}/json")
    if not isinstance(info, dict):
        raise McpToolError("Respons inspect tidak valid.")
    state = info.get("State") or {}
    config = info.get("Config") or {}
    return {
        "id": (info.get("Id") or "")[:12],
        "name": (info.get("Name") or "").lstrip("/"),
        "image": config.get("Image"),
        "status": state.get("Status"),
        "running": state.get("Running"),
        "exit_code": state.get("ExitCode"),
        "error": state.get("Error") or None,
        "started_at": state.get("StartedAt"),
        "health": (state.get("Health") or {}).get("Status"),
        "restart_count": (state.get("RestartCount")),
        "ip": ((info.get("NetworkSettings") or {}).get("IPAddress")) or None,
        "mounts": [
            {"source": m.get("Source"), "dest": m.get("Destination"), "rw": m.get("RW")}
            for m in (info.get("Mounts") or [])[:10]
        ],
    }


def tool_images(_args: dict[str, Any]) -> Any:
    items = _docker_request("GET", "/images/json") or []
    return {
        "count": len(items),
        "images": [
            {
                "repo_tags": (i.get("RepoTags") or ["<none>"])[:3],
                "size_mb": round((i.get("Size") or 0) / 1_000_000, 1),
                "created": i.get("Created"),
            }
            for i in items[:50]
        ],
    }


def tool_disk_usage(_args: dict[str, Any]) -> Any:
    data = _docker_request("GET", "/system/df") or {}
    return {
        "images": {"count": len(data.get("Images") or []), "size_mb": round(sum(i.get("Size") or 0 for i in data.get("Images") or []) / 1_000_000, 1)},
        "containers": {"count": len(data.get("Containers") or [])},
        "volumes": {"count": len(data.get("Volumes") or []), "size_mb": round(sum(v.get("UsageData", {}).get("Size", 0) if isinstance(v.get("UsageData"), dict) else 0 for v in data.get("Volumes") or []) / 1_000_000, 1)},
    }


def tool_version(_args: dict[str, Any]) -> Any:
    data = _docker_request("GET", "/version") or {}
    return {
        "version": data.get("Version"),
        "api_version": data.get("ApiVersion"),
        "os": data.get("Os"),
        "arch": data.get("Arch"),
    }


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "containers", "description": "Daftar container Docker + status (running/exited).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "inspect", "description": "Detail satu container (state, health, mounts, IP).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "images", "description": "Daftar image Docker + ukuran.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "disk_usage", "description": "Ringkasan pemakaian disk Docker (images/containers/volumes).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "version", "description": "Versi Docker Engine.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "containers": {"type": "object", "properties": {}, "additionalProperties": False},
    "inspect": {
        "type": "object",
        "properties": {"container": {"type": "string", "description": "Container id/nama, mis. orvexa-web"}},
        "required": ["container"],
        "additionalProperties": False,
    },
    "images": {"type": "object", "properties": {}, "additionalProperties": False},
    "disk_usage": {"type": "object", "properties": {}, "additionalProperties": False},
    "version": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "containers": tool_containers,
    "inspect": tool_inspect,
    "images": tool_images,
    "disk_usage": tool_disk_usage,
    "version": tool_version,
}

kit = McpServerKit(
    name="docker",
    tools=[
        McpTool(
            name=s["tool_name"],
            description=s["description"],
            input_schema=SCHEMAS[s["tool_name"]],
            handler=HANDLERS[s["tool_name"]],
            risk_level=s["risk_level"],
            requires_approval=s["requires_approval"],
        )
        for s in SEED_TOOLS
    ],
)

if __name__ == "__main__":
    serve(kit, default_port=9104)
