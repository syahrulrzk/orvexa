"""MikroTik MCP server (F6-04).

Tools (read-only, risiko rendah):
- `system_resource` — CPU/mem/uptime RouterOS (`/system/resource`)
- `interfaces`      — daftar interface + traffic counter (`/interface`)
- `routes`          — tabel routing (`/ip/route`)
- `dhcp_leases`     — lease DHCP aktif (`/ip/dhcp-server/lease`)
- `wireless`        — registrasi wireless client (`/interface/wireless/registration-table`)

Transport: RouterOS **REST API** (sejak RouterOS 7.1) dengan HTTP Basic auth.

Env:
- `MIKROTIK_URL` (default https://localhost:443)
- `MIKROTIK_USER` / `MIKROTIK_PASS`
- `MIKROTIK_TLS_VERIFY` (default false)
- `MCP_PORT` (default 9107), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    MIKROTIK_URL=https://192.168.88.1 python3 mcp-servers/mikrotik_server.py
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

MIKROTIK_URL = os.environ.get("MIKROTIK_URL", "https://localhost:443").rstrip("/")
MIKROTIK_USER = os.environ.get("MIKROTIK_USER", "admin")
MIKROTIK_PASS = os.environ.get("MIKROTIK_PASS", "")
TLS_VERIFY = os.environ.get("MIKROTIK_TLS_VERIFY", "false").lower() in ("1", "true", "yes")
HTTP_TIMEOUT = 20.0


def _routeros_get(path: str) -> list[dict[str, Any]]:
    try:
        resp = httpx.get(
            f"{MIKROTIK_URL}/rest{path}",
            auth=(MIKROTIK_USER, MIKROTIK_PASS),
            verify=TLS_VERIFY,
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise McpToolError(f"RouterOS tidak terjangkau di {MIKROTIK_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"RouterOS HTTP {resp.status_code}: {resp.text[:200]}")
    data = resp.json()
    return data if isinstance(data, list) else []


def tool_system_resource(_args: dict[str, Any]) -> Any:
    r = _routeros_get("/system/resource")[0] if _routeros_get("/system/resource") else {}
    return {
        "version": r.get("version"),
        "board_name": r.get("board-name"),
        "cpu_load": r.get("cpu-load"),
        "free_memory_mb": round(int(r.get("free-memory") or 0) / 1_000_000, 1),
        "total_memory_mb": round(int(r.get("total-memory") or 0) / 1_000_000, 1),
        "uptime": r.get("uptime"),
        "cpu_count": r.get("cpu-count"),
    }


def tool_interfaces(_args: dict[str, Any]) -> Any:
    items = _routeros_get("/interface")
    return {
        "count": len(items),
        "interfaces": [
            {
                "name": i.get("name"),
                "type": i.get("type"),
                "running": i.get("running"),
                "disabled": i.get("disabled"),
                "rx_bytes": i.get("rx-byte"),
                "tx_bytes": i.get("tx-byte"),
                "mtu": i.get("actual-mtu"),
            }
            for i in items[:50]
        ],
    }


def tool_routes(_args: dict[str, Any]) -> Any:
    items = _routeros_get("/ip/route")
    active = [r for r in items if r.get("active") == "true" or r.get("active") is True]
    return {
        "count": len(items),
        "active_count": len(active),
        "routes": [
            {
                "dst_address": r.get("dst-address"),
                "gateway": r.get("gateway"),
                "distance": r.get("distance"),
                "active": r.get("active"),
                "routing_table": r.get("routing-table"),
            }
            for r in items[:50]
        ],
    }


def tool_dhcp_leases(_args: dict[str, Any]) -> Any:
    items = _routeros_get("/ip/dhcp-server/lease")
    active = [l for l in items if l.get("status") == "bound"]
    return {
        "count": len(items),
        "bound": len(active),
        "leases": [
            {
                "host": l.get("host-name"),
                "mac": l.get("mac-address"),
                "address": l.get("address"),
                "status": l.get("status"),
                "server": l.get("server"),
            }
            for l in items[:50]
        ],
    }


def tool_wireless(_args: dict[str, Any]) -> Any:
    items = _routeros_get("/interface/wireless/registration-table")
    return {
        "count": len(items),
        "registrations": [
            {
                "interface": r.get("interface"),
                "mac": r.get("mac-address"),
                "signal_strength": r.get("signal-strength"),
                "tx_rate": r.get("tx-rate"),
                "uptime": r.get("uptime"),
            }
            for r in items[:50]
        ],
    }


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "system_resource", "description": "Resource RouterOS: CPU, memori, uptime, versi.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "interfaces", "description": "Daftar interface MikroTik + counter traffic.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "routes", "description": "Tabel routing IP (aktif/nonaktif).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "dhcp_leases", "description": "Lease DHCP server (status bound).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "wireless", "description": "Registrasi wireless client (signal, rate, uptime).",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "system_resource": {"type": "object", "properties": {}, "additionalProperties": False},
    "interfaces": {"type": "object", "properties": {}, "additionalProperties": False},
    "routes": {"type": "object", "properties": {}, "additionalProperties": False},
    "dhcp_leases": {"type": "object", "properties": {}, "additionalProperties": False},
    "wireless": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "system_resource": tool_system_resource,
    "interfaces": tool_interfaces,
    "routes": tool_routes,
    "dhcp_leases": tool_dhcp_leases,
    "wireless": tool_wireless,
}

kit = McpServerKit(
    name="mikrotik",
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
    serve(kit, default_port=9107)
