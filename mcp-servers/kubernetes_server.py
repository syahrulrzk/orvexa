"""Kubernetes MCP server (F6-03).

Tools (read-only, risiko rendah):
- `pods`          — daftar pod per namespace + status
- `nodes`         — daftar node + kondisi (ready/notready)
- `deployments`   — daftar deployment + replica ready
- `events`        — event terakhir per namespace
- `version`       — versi cluster (kubectl version)

Eksekusi via **kubectl CLI** (mewarisi kubeconfig env/kubecontext host) dengan
argumen dari whitelist — tanpa shell interpolation, sehingga argumen dari LLM
tidak bisa menyuntik perintah. Semua perintah read-only (`get`/`version`).

Env:
- `KUBECTL_BIN` (default kubectl)
- `MCP_PORT` (default 9105), `MCP_BEARER_TOKEN` (opsional)

Jalankan lokal:
    python3 mcp-servers/kubernetes_server.py
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from typing import Any

from common import McpServerKit, McpTool, McpToolError, serve

KUBECTL_BIN = os.environ.get("KUBECTL_BIN", "kubectl")


def _kubectl(args: list[str]) -> Any:
    """Jalankan kubectl dengan argumen fixed (tanpa shell) → JSON."""
    binary = shutil.which(KUBECTL_BIN)
    if not binary:
        raise McpToolError(f"kubectl tidak ditemukan di PATH (set KUBECTL_BIN).")
    try:
        proc = subprocess.run(
            [binary, *args, "-o", "json"],
            capture_output=True,
            timeout=30,
        )
    except subprocess.TimeoutExpired as exc:
        raise McpToolError("kubectl timeout (30s).") from exc
    if proc.returncode != 0:
        stderr = proc.stderr.decode(errors="replace")
        raise McpToolError(f"kubectl gagal (rc={proc.returncode}): {stderr[:200]}")
    try:
        return json.loads(proc.stdout.decode())
    except json.JSONDecodeError as exc:
        raise McpToolError("Output kubectl bukan JSON.") from exc


def _require(value: Any, field: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise McpToolError(f"Argumen `{field}` wajib diisi.")
    return text


def tool_pods(args: dict[str, Any]) -> Any:
    ns = str(args.get("namespace") or "default").strip()
    if not ns.replace("-", "").replace(".", "").isalnum():
        raise McpToolError("Namespace tidak valid.")
    data = _kubectl(["get", "pods", "-n", ns])
    items = data.get("items") or []
    return {
        "namespace": ns,
        "count": len(items),
        "pods": [
            {
                "name": (p.get("metadata") or {}).get("name"),
                "phase": (p.get("status") or {}).get("phase"),
                "ready": _ready(p),
                "restarts": _restarts(p),
                "node": (p.get("spec") or {}).get("nodeName"),
            }
            for p in items[:50]
        ],
    }


def _ready(pod: dict[str, Any]) -> str:
    statuses = ((pod.get("status") or {}).get("containerStatuses")) or []
    if not statuses:
        return "0/0"
    ready = sum(1 for s in statuses if s.get("ready"))
    return f"{ready}/{len(statuses)}"


def _restarts(pod: dict[str, Any]) -> int:
    statuses = ((pod.get("status") or {}).get("containerStatuses")) or []
    return sum(int(s.get("restartCount") or 0) for s in statuses)


def tool_nodes(_args: dict[str, Any]) -> Any:
    data = _kubectl(["get", "nodes"])
    items = data.get("items") or []
    nodes = []
    for n in items:
        conds = {c.get("type"): c.get("status") for c in (n.get("status") or {}).get("conditions") or []}
        nodes.append(
            {
                "name": (n.get("metadata") or {}).get("name"),
                "ready": conds.get("Ready") == "True",
                "version": ((n.get("status") or {}).get("nodeInfo") or {}).get("kubeletVersion"),
                "role": next(
                    (lbl.split("/", 1)[1] for lbl in ((n.get("metadata") or {}).get("labels") or {}) if lbl.startswith("node-role.kubernetes.io/")),
                    "worker",
                ),
            }
        )
    return {"count": len(nodes), "ready": sum(1 for x in nodes if x["ready"]), "nodes": nodes}


def tool_deployments(args: dict[str, Any]) -> Any:
    ns = str(args.get("namespace") or "default").strip()
    if not ns.replace("-", "").replace(".", "").isalnum():
        raise McpToolError("Namespace tidak valid.")
    data = _kubectl(["get", "deployments", "-n", ns])
    items = data.get("items") or []
    return {
        "namespace": ns,
        "count": len(items),
        "deployments": [
            {
                "name": (d.get("metadata") or {}).get("name"),
                "ready": f"{(d.get('status') or {}).get('readyReplicas', 0)}/{(d.get('spec') or {}).get('replicas', 0)}",
                "available": (d.get("status") or {}).get("availableReplicas", 0),
            }
            for d in items[:50]
        ],
    }


def tool_events(args: dict[str, Any]) -> Any:
    ns = str(args.get("namespace") or "default").strip()
    if not ns.replace("-", "").replace(".", "").isalnum():
        raise McpToolError("Namespace tidak valid.")
    data = _kubectl(["get", "events", "-n", ns, "--sort-by", ".lastTimestamp"])
    items = data.get("items") or []
    return {
        "namespace": ns,
        "count": len(items),
        "events": [
            {
                "type": (e.get("type")),
                "reason": (e.get("reason")),
                "object": (e.get("involvedObject") or {}).get("name"),
                "message": (e.get("message")),
                "count": (e.get("count")),
                "last_seen": (e.get("lastTimestamp")),
            }
            for e in items[-30:][::-1]
        ],
    }


def tool_version(_args: dict[str, Any]) -> Any:
    data = _kubectl(["version", "--output", "json"])
    client = (data.get("clientVersion") or {}).get("gitVersion")
    server = (data.get("serverVersion") or {}).get("gitVersion")
    return {"client": client, "server": server}


# Katalog seed-side (dipakai apps/web/scripts/seed.ts agar tidak duplikasi).
SEED_TOOLS = [
    {"tool_name": "pods", "description": "Daftar pod Kubernetes per namespace + status/ready/restarts.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "nodes", "description": "Daftar node cluster + kondisi Ready.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "deployments", "description": "Daftar deployment + replica ready per namespace.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "events", "description": "Event Kubernetes terakhir per namespace.",
     "risk_level": "low", "requires_approval": False},
    {"tool_name": "version", "description": "Versi client & server Kubernetes.",
     "risk_level": "low", "requires_approval": False},
]

SCHEMAS: dict[str, dict[str, Any]] = {
    "pods": {
        "type": "object",
        "properties": {"namespace": {"type": "string", "description": "Default 'default'."}},
        "additionalProperties": False,
    },
    "nodes": {"type": "object", "properties": {}, "additionalProperties": False},
    "deployments": {
        "type": "object",
        "properties": {"namespace": {"type": "string"}},
        "additionalProperties": False,
    },
    "events": {
        "type": "object",
        "properties": {"namespace": {"type": "string"}},
        "additionalProperties": False,
    },
    "version": {"type": "object", "properties": {}, "additionalProperties": False},
}

HANDLERS = {
    "pods": tool_pods,
    "nodes": tool_nodes,
    "deployments": tool_deployments,
    "events": tool_events,
    "version": tool_version,
}

kit = McpServerKit(
    name="kubernetes",
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
    serve(kit, default_port=9105)
