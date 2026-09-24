"""Prometheus MCP server (F6-02).

Tools (semua read-only, risiko rendah):
- `query`        — instant query PromQL (`/api/v1/query`)
- `query_range`  — range query PromQL (`/api/v1/query_range`)
- `alerts`       — daftar alert aktif (`/api/v1/alerts`)
- `targets`      — daftar scrape target + health (`/api/v1/targets`)
- `health`       — cek kesehatan Prometheus (`/-/healthy`)

Env:
- `PROMETHEUS_URL` (default http://localhost:9090)
- `MCP_PORT` (default 9101)
- `MCP_BEARER_TOKEN` (opsional; auth inline server MCP ini sendiri)

Jalankan lokal:
    PROMETHEUS_URL=http://localhost:9090 python3 mcp-servers/prometheus_server.py
"""

from __future__ import annotations

import os
import time
from typing import Any

import httpx

from common import McpServerKit, McpTool, McpToolError, serve

PROM_URL = os.environ.get("PROMETHEUS_URL", "http://localhost:9090").rstrip("/")
HTTP_TIMEOUT = 15.0


def _prom_get(path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    try:
        resp = httpx.get(f"{PROM_URL}{path}", params=params, timeout=HTTP_TIMEOUT)
    except httpx.HTTPError as exc:
        raise McpToolError(f"Prometheus tidak terjangkau di {PROM_URL}: {exc}") from exc
    if resp.status_code >= 400:
        raise McpToolError(f"Prometheus HTTP {resp.status_code}: {resp.text[:200]}")
    try:
        body = resp.json()
    except ValueError as exc:
        raise McpToolError("Respons Prometheus bukan JSON.") from exc
    if body.get("status") != "success":
        raise McpToolError(f"Prometheus error: {str(body.get('error'))[:200]}")
    return body.get("data") or {}


def _require(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise McpToolError(f"Argumen `{field}` wajib diisi.")
    return text


def tool_query(args: dict[str, Any]) -> Any:
    query = _require(args.get("query"), "query")
    params: dict[str, str] = {"query": query}
    if args.get("time") is not None:
        params["time"] = str(args["time"])
    data = _prom_get("/api/v1/query", params)
    result = data.get("result") or []
    return {
        "resultType": data.get("resultType"),
        "count": len(result),
        "series": [
            {"metric": s.get("metric"), "value": s.get("value")} for s in result[:50]
        ],
    }


def tool_query_range(args: dict[str, Any]) -> Any:
    query = _require(args.get("query"), "query")
    start = _require(args.get("start"), "start")
    end = _require(args.get("end"), "end")
    step = _require(args.get("step"), "step")
    data = _prom_get(
        "/api/v1/query_range",
        {"query": query, "start": start, "end": end, "step": step},
    )
    result = data.get("result") or []
    return {
        "resultType": data.get("resultType"),
        "count": len(result),
        "series": [
            {"metric": s.get("metric"), "values_count": len(s.get("values") or [])}
            for s in result[:50]
        ],
    }


def tool_alerts(_args: dict[str, Any]) -> Any:
    data = _prom_get("/api/v1/alerts")
    alerts = data.get("alerts") or []
    return {
        "count": len(alerts),
        "alerts": [
            {
                "name": a.get("labels", {}).get("alertname"),
                "state": a.get("state"),
                "severity": a.get("labels", {}).get("severity"),
                "description": a.get("annotations", {}).get("description"),
                "active_at": a.get("activeAt"),
            }
            for a in alerts[:50]
        ],
    }


def tool_targets(_args: dict[str, Any]) -> Any:
    data = _prom_get("/api/v1/targets")
    targets = (data.get("activeTargets") or [])[:100]
    up = sum(1 for t in targets if t.get("health") == "up")
    return {
        "total": len(targets),
        "up": up,
        "down": len(targets) - up,
        "targets": [
            {
                "job": t.get("labels", {}).get("job"),
                "instance": t.get("labels", {}).get("instance"),
                "health": t.get("health"),
                "error": t.get("lastError") or None,
            }
            for t in targets
        ],
    }


def tool_health(_args: dict[str, Any]) -> Any:
    try:
        resp = httpx.get(f"{PROM_URL}/-/healthy", timeout=5.0)
    except httpx.HTTPError as exc:
        return {"healthy": False, "url": PROM_URL, "error": str(exc)[:200]}
    return {"healthy": resp.status_code == 200, "url": PROM_URL, "status": resp.text.strip()[:100]}


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "query", "description": "Instant query PromQL (metrics saat ini).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "query_range", "description": "Range query PromQL (deret waktu, butuh start/end/step).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "alerts", "description": "Daftar alert Prometheus yang aktif.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "targets", "description": "Daftar scrape target Prometheus + health (up/down).",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "health", "description": "Cek kesehatan server Prometheus.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "query": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "PromQL, mis. up or rate(node_cpu_seconds_total[5m])"},
            "time": {"type": "string", "description": "Opsional: RFC3339 / unix timestamp evaluasi."},
        },
        "required": ["query"],
        "additionalProperties": False,
    },
    "query_range": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "start": {"type": "string", "description": "RFC3339 / unix (mis. 2026-09-24T00:00:00Z)"},
            "end": {"type": "string"},
            "step": {"type": "string", "description": "mis. 60s, 5m, 1h"},
        },
        "required": ["query", "start", "end", "step"],
        "additionalProperties": False,
    },
    "alerts": {"type": "object", "properties": {}, "additionalProperties": False},
    "targets": {"type": "object", "properties": {}, "additionalProperties": False},
    "health": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "query": tool_query,
    "query_range": tool_query_range,
    "alerts": tool_alerts,
    "targets": tool_targets,
    "health": tool_health,
}

kit = McpServerKit(
    name="prometheus",
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
    _ = time  # keep import for type consistency in minimal environments
    serve(kit, default_port=9101)
