"""Wazuh MCP server (F6-03).

Tools (read-only, risiko rendah):
- `agents`            — daftar agent terdaftar + status (`/agents`)
- `agent_summary`     — ringkasan status agent (`/overview/agents`)
- `vulnerabilities`   — vuln per agent (`/vulnerability/{agent_id}`)
- `rules`             — cari aturan detection (`/rules`)
- `manager_status`    — status manager daemon (`/manager/status`)

Auth: Wazuh API memakai JWT (basic auth → `POST /security/user/authenticate`
→ token) di-cache ~800 detik. Kredensial dari env service ini:

- `WAZUH_URL` (default https://localhost:55000)
- `WAZUH_USER` / `WAZUH_PASS` (default wazuh-wui / wazuh-wui)
- `WAZUH_TLS_VERIFY` (default false — self-signed umum di lab)
- `MCP_PORT` (default 9103), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    WAZUH_URL=https://localhost:55000 python3 mcp-servers/wazuh_server.py
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

WAZUH_URL = os.environ.get("WAZUH_URL", "https://localhost:55000").rstrip("/")
WAZUH_USER = os.environ.get("WAZUH_USER", "wazuh-wui")
WAZUH_PASS = os.environ.get("WAZUH_PASS", "wazuh-wui")
TLS_VERIFY = os.environ.get("WAZUH_TLS_VERIFY", "false").lower() in ("1", "true", "yes")

_TOKEN: str | None = None
_TOKEN_TS: float = 0.0
_TOKEN_TTL = 800.0  # detik; JWT Wazuh default 900 — ambil aman
HTTP_TIMEOUT = 20.0


def _get_token() -> str:
    global _TOKEN, _TOKEN_TS
    if _TOKEN and (time.monotonic() - _TOKEN_TS) < _TOKEN_TTL:
        return _TOKEN
    try:
        resp = httpx.post(
            f"{WAZUH_URL}/security/user/authenticate",
            auth=(WAZUH_USER, WAZUH_PASS),
            verify=TLS_VERIFY,
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise McpToolError(f"Wazuh tidak terjangkau di {WAZUH_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"Wazuh auth gagal (HTTP {resp.status_code}): {resp.text[:200]}")
    data = resp.json().get("data") or {}
    token = data.get("token")
    if not token:
        raise McpToolError("Respons auth Wazuh tanpa token.")
    _TOKEN = str(token)
    _TOKEN_TS = time.monotonic()
    return _TOKEN


def _wazuh_get(path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    try:
        resp = httpx.get(
            f"{WAZUH_URL}{path}",
            params=params,
            headers={"Authorization": f"Bearer {_get_token()}"},
            verify=TLS_VERIFY,
            timeout=HTTP_TIMEOUT,
        )
    except httpx.HTTPError as exc:
        raise McpToolError(f"Wazuh tidak terjangkau di {WAZUH_URL}: {exc}") from exc
    if resp.status_code >= 400:
        # token expired → coba sekali lagi dengan token baru
        global _TOKEN
        if resp.status_code == 401:
            _TOKEN = None
            return _wazuh_get(path, params)
        raise McpToolError(f"Wazuh HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json().get("data") or {}


def _require(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise McpToolError(f"Argumen `{field}` wajib diisi.")
    return text


def tool_agents(args: dict[str, Any]) -> Any:
    params: dict[str, str] = {"limit": "100"}
    if args.get("status"):
        params["status"] = _require(args["status"], "status")
    data = _wazuh_get("/agents", params)
    items = data.get("affected_items") or []
    return {
        "count": data.get("total_affected_items", len(items)),
        "agents": [
            {
                "id": a.get("id"),
                "name": a.get("name"),
                "status": a.get("status"),
                "os": (a.get("os") or {}).get("name"),
                "ip": a.get("ip"),
                "version": a.get("version"),
                "last_keepalive": a.get("last_keepalive"),
            }
            for a in items[:50]
        ],
    }


def tool_agent_summary(_args: dict[str, Any]) -> Any:
    data = _wazuh_get("/overview/agents")
    status = data.get("agent_status") or {}
    return {
        "total": data.get("total_agents", 0),
        "active": status.get("active"),
        "disconnected": status.get("disconnected"),
        "never_connected": status.get("never_connected"),
        "pending": status.get("pending"),
        "os_count": len(data.get("agent_os") or []),
        "groups": [g.get("name") for g in (data.get("groups") or {}).get("affected_items", [])][:20],
    }


def tool_vulnerabilities(args: dict[str, Any]) -> Any:
    agent_id = _require(args.get("agent_id"), "agent_id")
    params: dict[str, str] = {"limit": "50"}
    if args.get("severity"):
        params["severity"] = _require(args["severity"], "severity")
    data = _wazuh_get(f"/vulnerability/{agent_id}", params)
    items = data.get("affected_items") or []
    return {
        "agent_id": agent_id,
        "count": data.get("total_affected_items", len(items)),
        "vulnerabilities": [
            {
                "cve": v.get("cve"),
                "severity": v.get("severity"),
                "name": v.get("name"),
                "version": v.get("version"),
                "published": v.get("published"),
            }
            for v in items[:50]
        ],
    }


def tool_rules(args: dict[str, Any]) -> Any:
    params: dict[str, str] = {"limit": "30"}
    if args.get("query"):
        params["q"] = str(args["query"])
    data = _wazuh_get("/rules", params)
    items = data.get("affected_items") or []
    return {
        "count": data.get("total_affected_items", len(items)),
        "rules": [
            {
                "id": r.get("id"),
                "description": r.get("description"),
                "level": r.get("level"),
                "groups": r.get("groups"),
                "mitre": r.get("mitre"),
            }
            for r in items[:30]
        ],
    }


def tool_manager_status(_args: dict[str, Any]) -> Any:
    data = _wazuh_get("/manager/status")
    inner = data.get("affected_items") or [{}]
    daemons = inner[0]
    return {
        "running": {k: v for k, v in daemons.items() if v == "running"} if isinstance(daemons, dict) else {},
        "not_running": {k: v for k, v in daemons.items() if v != "running"} if isinstance(daemons, dict) else {},
    }


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "agents", "description": "Daftar agent Wazuh terdaftar + status.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "agent_summary", "description": "Ringkasan status seluruh agent Wazuh.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "vulnerabilities", "description": "Daftar kerentanan (CVE) per agent Wazuh.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "rules", "description": "Cari aturan deteksi Wazuh (query, level, MITRE).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "manager_status", "description": "Status daemon Wazuh manager.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "agents": {
        "type": "object",
        "properties": {"status": {"type": "string", "description": "active | disconnected | never_connected | pending"}},
        "additionalProperties": False,
    },
    "agent_summary": {"type": "object", "properties": {}, "additionalProperties": False},
    "vulnerabilities": {
        "type": "object",
        "properties": {
            "agent_id": {"type": "string", "description": "ID agent Wazuh (mis. 001)."},
            "severity": {"type": "string", "description": "Low | Medium | High | Critical (opsional)."},
        },
        "required": ["agent_id"],
        "additionalProperties": False,
    },
    "rules": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "Filter Wazuh, mis. level>=10; groups:ssh."}},
        "additionalProperties": False,
    },
    "manager_status": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "agents": tool_agents,
    "agent_summary": tool_agent_summary,
    "vulnerabilities": tool_vulnerabilities,
    "rules": tool_rules,
    "manager_status": tool_manager_status,
}

kit = McpServerKit(
    name="wazuh",
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
    serve(kit, default_port=9103)
