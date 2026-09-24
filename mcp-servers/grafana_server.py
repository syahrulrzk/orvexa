"""Grafana MCP server (F6-02).

Tools (semua read-only, risiko rendah):
- `search_dashboards` — cari dashboard (`/api/search`)
- `get_dashboard`     — detail dashboard by uid (`/api/dashboards/uid/{uid}`)
- `datasources`       — daftar datasource (`/api/datasources`)
- `health`            — cek kesehatan Grafana (`/api/health`)

Env:
- `GRAFANA_URL` (default http://localhost:3001)
- `GRAFANA_API_KEY` — service account token (`glsa_...`) / basic "user:pass"
- `MCP_PORT` (default 9102)
- `MCP_BEARER_TOKEN` (opsional; auth inline server MCP ini sendiri)

Catatan auth: kredensial Grafana TIDAK di-set di env worker melainkan lewat
`auth` server MCP di DB (terenkripsi) ATAU env `GRAFANA_API_KEY` di service
ini. Bila keduanya kosong, tool tetap bisa jalan untuk instance tanpa auth.
"""

from __future__ import annotations

import os
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

GRAFANA_URL = os.environ.get("GRAFANA_URL", "http://localhost:3001").rstrip("/")
GRAFANA_API_KEY = os.environ.get("GRAFANA_API_KEY", "").strip()
HTTP_TIMEOUT = 15.0


def _grafana_get(path: str, params: dict[str, str] | None = None) -> Any:
    headers: dict[str, str] = {}
    if GRAFANA_API_KEY:
        if GRAFANA_API_KEY.startswith(("glsa_", "eyJ")):
            headers["Authorization"] = f"Bearer {GRAFANA_API_KEY}"
        elif ":" in GRAFANA_API_KEY:
            headers["Authorization"] = f"Basic {__import__('base64').b64encode(GRAFANA_API_KEY.encode()).decode()}"
        else:
            headers["Authorization"] = f"Bearer {GRAFANA_API_KEY}"
    try:
        resp = httpx.get(f"{GRAFANA_URL}{path}", params=params, headers=headers, timeout=HTTP_TIMEOUT)
    except httpx.HTTPError as exc:
        raise McpToolError(f"Grafana tidak terjangkau di {GRAFANA_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"Grafana HTTP {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def tool_search(args: dict[str, Any]) -> Any:
    params: dict[str, str] = {}
    if args.get("query"):
        params["query"] = str(args["query"])
    if args.get("tag"):
        params["tag"] = str(args["tag"])
    results = _grafana_get("/api/search", params) or []
    return {
        "count": len(results),
        "dashboards": [
            {
                "uid": d.get("uid"),
                "title": d.get("title"),
                "folder": d.get("folderTitle"),
                "tags": d.get("tags"),
            }
            for d in results[:50]
        ],
    }


def tool_get_dashboard(args: dict[str, Any]) -> Any:
    uid = str(args.get("uid") or "").strip()
    if not uid:
        raise McpToolError("Argumen `uid` wajib diisi.")
    body = _grafana_get(f"/api/dashboards/uid/{uid}")
    meta = body.get("meta") or {}
    dash = body.get("dashboard") or {}
    panels = dash.get("panels") or []
    return {
        "uid": dash.get("uid"),
        "title": dash.get("title"),
        "url": meta.get("url"),
        "tags": dash.get("tags"),
        "panel_count": len(panels),
        "panels": [
            {"id": p.get("id"), "title": p.get("title"), "type": p.get("type")}
            for p in panels[:30]
        ],
    }


def tool_datasources(_args: dict[str, Any]) -> Any:
    ds = _grafana_get("/api/datasources") or []
    return {
        "count": len(ds),
        "datasources": [
            {
                "name": d.get("name"),
                "type": d.get("type"),
                "is_default": d.get("isDefault"),
                "url": d.get("url"),
            }
            for d in ds[:50]
        ],
    }


def tool_health(_args: dict[str, Any]) -> Any:
    try:
        resp = httpx.get(f"{GRAFANA_URL}/api/health", timeout=5.0)
    except httpx.HTTPError as exc:
        return {"healthy": False, "url": GRAFANA_URL, "error": str(exc)[:200]}
    if resp.status_code >= 400:
        return {"healthy": False, "url": GRAFANA_URL, "http_status": resp.status_code}
    body = {}
    try:
        body = resp.json()
    except ValueError:
        pass
    return {"healthy": True, "url": GRAFANA_URL, "version": body.get("version"), "database": body.get("database")}


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "search_dashboards", "description": "Cari dashboard Grafana (query/tag).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "get_dashboard", "description": "Detail dashboard Grafana by uid (judul, panel, URL).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "datasources", "description": "Daftar datasource Grafana.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "health", "description": "Cek kesehatan Grafana.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "search_dashboards": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Kata kunci judul dashboard."},
            "tag": {"type": "string", "description": "Filter satu tag."},
        },
        "additionalProperties": False,
    },
    "get_dashboard": {
        "type": "object",
        "properties": {"uid": {"type": "string"}},
        "required": ["uid"],
        "additionalProperties": False,
    },
    "datasources": {"type": "object", "properties": {}, "additionalProperties": False},
    "health": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "search_dashboards": tool_search,
    "get_dashboard": tool_get_dashboard,
    "datasources": tool_datasources,
    "health": tool_health,
}

kit = McpServerKit(
    name="grafana",
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
    serve(kit, default_port=9102)
