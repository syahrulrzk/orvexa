"""FortiGate MCP server (F6-04) — representasi "Firewall" di PRD.

Tools (read-only, risiko rendah):
- `system_status`    — firmware/serial/hostname (`/api/v2/monitor/system/status`)
- `system_performance` — CPU/mem/sesi (`/api/v2/monitor/system/firmware` + resource)
- `firewall_policies`  — daftar policy + counter hit (`/api/v2/cmdb/firewall/policy`)
- `firewall_addresses` — objek address (`/api/v2/cmdb/firewall/address`)
- `interfaces`         — daftar interface + status (`/api/v2/monitor/system/interface`)

Transport: FortiGate **REST API v2** dengan token API (`Authorization: Bearer`).
Token dibuat di FortiGate (System → Admin Profiles → REST API Admin).

Env:
- `FORTIGATE_URL` (default https://localhost:8443)
- `FORTIGATE_TOKEN` (REST API token)
- `FORTIGATE_TLS_VERIFY` (default false)
- `MCP_PORT` (default 9108), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    FORTIGATE_URL=https://192.168.1.99 FORTIGATE_TOKEN=xxx python3 mcp-servers/fortigate_server.py
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

FORTIGATE_URL = os.environ.get("FORTIGATE_URL", "https://localhost:8443").rstrip("/")
FORTIGATE_TOKEN = os.environ.get("FORTIGATE_TOKEN", "")
TLS_VERIFY = os.environ.get("FORTIGATE_TLS_VERIFY", "false").lower() in ("1", "true", "yes")
HTTP_TIMEOUT = 20.0


def _forti_get(path: str, params: dict[str, str] | None = None) -> Any:
    if not FORTIGATE_TOKEN:
        raise McpToolError("FORTIGATE_TOKEN belum diset — tool firewall tidak tersedia.")
    try:
        resp = httpx.get(
            f"{FORTIGATE_URL}{path}",
            params=params,
            headers={"Authorization": f"Bearer {FORTIGATE_TOKEN}"},
            verify=TLS_VERIFY,
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise McpToolError(f"FortiGate tidak terjangkau di {FORTIGATE_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"FortiGate HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def tool_system_status(_args: dict[str, Any]) -> Any:
    body = _forti_get("/api/v2/monitor/system/status")
    results = (body.get("results") or {}) if isinstance(body, dict) else {}
    return {
        "hostname": results.get("hostname"),
        "serial": results.get("serial_number"),
        "version": results.get("version"),
        "platform": results.get("platform"),
        "uptime": results.get("up_time"),
    }


def tool_system_performance(_args: dict[str, Any]) -> Any:
    body = _forti_get("/api/v2/monitor/system/resource/usage", {"interval": "1-hour"})
    results = (body.get("results") or {}) if isinstance(body, dict) else {}
    cpu = (results.get("cpu") or {}).get("cpu_usage_percent") or []
    mem = (results.get("mem") or {}).get("mem_usage_percent") or []
    return {
        "cpu_percent_now": cpu[-1] if cpu else None,
        "mem_percent_now": mem[-1] if mem else None,
        "interval": "1-hour",
    }


def tool_firewall_policies(_args: dict[str, Any]) -> Any:
    body = _forti_get("/api/v2/cmdb/firewall/policy", {"count": "100"})
    items = body.get("results") or []
    return {
        "count": len(items),
        "policies": [
            {
                "id": p.get("policyid"),
                "name": p.get("name"),
                "srcintf": [i.get("name") for i in p.get("srcintf") or []],
                "dstintf": [i.get("name") for i in p.get("dstintf") or []],
                "action": p.get("action"),
                "status": p.get("status"),
                "hit_count": p.get("hit_count"),
                "bytes": p.get("bytes"),
            }
            for p in items[:50]
        ],
    }


def tool_firewall_addresses(_args: dict[str, Any]) -> Any:
    body = _forti_get("/api/v2/cmdb/firewall/address", {"count": "100"})
    items = body.get("results") or []
    return {
        "count": len(items),
        "addresses": [
            {
                "name": a.get("name"),
                "type": a.get("type"),
                "subnet": a.get("subnet"),
                "comment": (a.get("comment") or "")[:100] or None,
            }
            for a in items[:50]
        ],
    }


def tool_interfaces(_args: dict[str, Any]) -> Any:
    body = _forti_get("/api/v2/monitor/system/interface/select")
    items = body.get("results") if isinstance(body, dict) else None
    if isinstance(items, dict):
        items = list(items.values())
    items = items or []
    return {
        "count": len(items),
        "interfaces": [
            {
                "name": i.get("name") or i.get("id"),
                "ip": i.get("ip"),
                "link": i.get("link"),
                "speed": i.get("speed"),
                "media": i.get("media"),
            }
            for i in items[:50]
        ],
    }


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "system_status", "description": "Status FortiGate: firmware, serial, uptime.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "system_performance", "description": "Performa FortiGate: CPU & memori (1 jam terakhir).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "firewall_policies", "description": "Daftar policy firewall + hit counter.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "firewall_addresses", "description": "Daftar objek address firewall.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "interfaces", "description": "Daftar interface FortiGate + status link.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "system_status": {"type": "object", "properties": {}, "additionalProperties": False},
    "system_performance": {"type": "object", "properties": {}, "additionalProperties": False},
    "firewall_policies": {"type": "object", "properties": {}, "additionalProperties": False},
    "firewall_addresses": {"type": "object", "properties": {}, "additionalProperties": False},
    "interfaces": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "system_status": tool_system_status,
    "system_performance": tool_system_performance,
    "firewall_policies": tool_firewall_policies,
    "firewall_addresses": tool_firewall_addresses,
    "interfaces": tool_interfaces,
}

kit = McpServerKit(
    name="fortigate",
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
    serve(kit, default_port=9108)
