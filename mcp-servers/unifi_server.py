"""UniFi MCP server (F6-04).

Tools (read-only, risiko rendah):
- `sites`        — daftar site (`/api/self/sites`)
- `devices`      — daftar device (AP/switch/gateway) + status di satu site
- `clients`      — daftar client aktif di satu site
- `site_health`  — health sub-sistem (wan/www/lan/wlan/vpn) per site

Auth: UniFi Controller login form → cookie SESSION + CSRF header. Dua varian
endpoint yang umum didukung otomatis:
  - self-hosted : `POST {base}/api/login`  (payload {username, password})
  - UniFi OS    : `POST {base}/api/auth/login`

Env:
- `UNIFI_URL` (default https://localhost:8443)
- `UNIFI_USER` / `UNIFI_PASS`
- `UNIFI_TLS_VERIFY` (default false)
- `MCP_PORT` (default 9106), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    UNIFI_URL=https://localhost:8443 python3 mcp-servers/unifi_server.py
"""

from __future__ import annotations

import os
import ssl
import time
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

UNIFI_URL = os.environ.get("UNIFI_URL", "https://localhost:8443").rstrip("/")
UNIFI_USER = os.environ.get("UNIFI_USER", "")
UNIFI_PASS = os.environ.get("UNIFI_PASS", "")
TLS_VERIFY = os.environ.get("UNIFI_TLS_VERIFY", "false").lower() in ("1", "true", "yes")

# TLS verify=false → matikan warning agar log bersih (pilihan sadar untuk lab).
if not TLS_VERIFY:
    try:
        ssl._create_unverified_context()  # noqa: SLF318
    except Exception:  # noqa: BLE001
        pass

_CLIENT: httpx.AsyncClient | None = None
_COOKIE_TS: float = 0.0
_COOKIE_TTL = 3600.0
HTTP_TIMEOUT = 20.0


def _client() -> httpx.AsyncClient:
    global _CLIENT
    if _CLIENT is None:
        _CLIENT = httpx.AsyncClient(verify=TLS_VERIFY, timeout=HTTP_TIMEOUT)
    return _CLIENT


async def _login() -> None:
    """Login sekali; cookie SESSION disimpan di client (cookie jar)."""
    global _COOKIE_TS
    if UNIFI_PASS and (time.monotonic() - _COOKIE_TS) < _COOKIE_TTL and _CLIENT and _CLIENT.cookies:
        return
    client = _client()
    creds = {"username": UNIFI_USER, "password": UNIFI_PASS}
    for path in ("/api/auth/login", "/api/login"):
        try:
            resp = await client.post(f"{UNIFI_URL}{path}", json=creds)
        except httpx.HTTPError as exc:
            raise McpToolError(f"UniFi tidak terjangkau di {UNIFI_URL}: {exc}") from exc
        if resp.status_code < 400:
            _COOKIE_TS = time.monotonic()
            return
        if resp.status_code == 401:
            raise McpToolError("UniFi login ditolak (401): periksa UNIFI_USER/UNIFI_PASS.")
    raise McpToolError("UniFi login gagal di kedua varian endpoint.")


async def _unifi_get(path: str) -> list[dict[str, Any]]:
    await _login()
    client = _client()
    try:
        resp = await client.get(f"{UNIFI_URL}{path}")
    except httpx.HTTPError as exc:
        raise McpToolError(f"UniFi tidak terjangkau di {UNIFI_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"UniFi HTTP {resp.status_code}: {resp.text[:200]}")
    body = resp.json()
    data = body.get("data") if isinstance(body, dict) else body
    return data if isinstance(data, list) else []


def _require(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise McpToolError(f"Argumen `{field}` wajib diisi.")
    return text


async def tool_sites(_args: dict[str, Any]) -> Any:
    sites = await _unifi_get("/api/self/sites")
    return {
        "count": len(sites),
        "sites": [
            {"name": s.get("name"), "desc": s.get("desc"), "id": s.get("_id")}
            for s in sites[:20]
        ],
    }


async def tool_devices(args: dict[str, Any]) -> Any:
    site = _require(args.get("site"), "site")
    items = await _unifi_get(f"/api/s/{site}/stat/device")
    return {
        "site": site,
        "count": len(items),
        "devices": [
            {
                "name": d.get("name") or d.get("hostname"),
                "model": d.get("model"),
                "type": d.get("type"),
                "state": d.get("state"),
                "version": d.get("version"),
                "ip": d.get("ip"),
                "uptime": d.get("uptime"),
                "adopted": d.get("adopted", True),
            }
            for d in items[:50]
        ],
    }


async def tool_clients(args: dict[str, Any]) -> Any:
    site = _require(args.get("site"), "site")
    items = await _unifi_get(f"/api/s/{site}/stat/sta")
    return {
        "site": site,
        "count": len(items),
        "clients": [
            {
                "hostname": c.get("hostname") or c.get("name"),
                "ip": c.get("ip"),
                "mac": c.get("mac"),
                "is_wired": c.get("is_wired"),
                "signal": c.get("signal"),
                # MAC AP terhubung (mapping ke nama mahal; cukup MAC untuk triase)
                "ap_mac": c.get("ap_mac"),
            }
            for c in items[:50]
        ],
    }


async def tool_site_health(args: dict[str, Any]) -> Any:
    site = _require(args.get("site"), "site")
    items = await _unifi_get(f"/api/s/{site}/stat/health")
    return {
        "site": site,
        "subsystems": [
            {
                "subsystem": h.get("subsystem"),
                "status": h.get("status"),
                "num_user": h.get("num_user"),
                "num_guest": h.get("num_guest"),
                "wan_ip": h.get("wan_ip"),
                "uptime": h.get("uptime"),
            }
            for h in items[:20]
        ],
    }


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "sites", "description": "Daftar site UniFi Controller.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "devices", "description": "Daftar device UniFi (AP/switch/gateway) + status per site.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "clients", "description": "Daftar client aktif (wifi/wired) per site.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "site_health", "description": "Health sub-sistem UniFi (wan/lan/wlan/vpn) per site.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "sites": {"type": "object", "properties": {}, "additionalProperties": False},
    "devices": {
        "type": "object",
        "properties": {"site": {"type": "string", "description": "Nama site, mis. default"}},
        "required": ["site"],
        "additionalProperties": False,
    },
    "clients": {
        "type": "object",
        "properties": {"site": {"type": "string"}},
        "required": ["site"],
        "additionalProperties": False,
    },
    "site_health": {
        "type": "object",
        "properties": {"site": {"type": "string"}},
        "required": ["site"],
        "additionalProperties": False,
    },
}

HANDLERS = {
    "sites": tool_sites,
    "devices": tool_devices,
    "clients": tool_clients,
    "site_health": tool_site_health,
}

kit = McpServerKit(
    name="unifi",
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
    serve(kit, default_port=9106)
