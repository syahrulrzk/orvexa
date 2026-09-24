"""Kerangka MCP server (F6-02) — reusable untuk semua server Orvexa.

Satu modul ini menyediakan:
- HTTP handler JSON-RPC 2.0 (Streamable HTTP subset: JSON request/response,
  `Mcp-Session-Id` diterima & dikembalikan) di path `/mcp`.
- Routing `initialize`, `notifications/initialized`, `ping`, `tools/list`,
  `tools/call`.
- Definisi tool berbasis dataclass `McpTool` (nama, deskripsi, JSON Schema,
  handler, risk level, requires_approval).
- Inline auth Bearer opsional (`MCP_BEARER_TOKEN` env) — dipakai seed untuk
  menguji jalur `auth` server MCP end-to-end.

Server konkret (prometheus, grafana) cukup mendefinisikan TOOLS list lalu
memanggil `serve()`.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from dataclasses import dataclass, field
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("orvexa.mcp-server")

JSONRPC = "2.0"
SESSION_HEADER = "Mcp-Session-Id"


class McpToolError(Exception):
    """Error bisnis tool (dilaporkan sebagai isError=True, bukan HTTP error)."""


@dataclass
class McpTool:
    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[dict[str, Any]], Any]
    risk_level: str = "low"
    requires_approval: bool = False


@dataclass
class McpServerKit:
    name: str
    version: str = "1.0.0"
    tools: list[McpTool] = field(default_factory=list)


def jsonrpc_result(request_id: Any, result: dict[str, Any]) -> dict[str, Any]:
    return {"jsonrpc": JSONRPC, "id": request_id, "result": result}


def jsonrpc_error(request_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": JSONRPC, "id": request_id, "error": {"code": code, "message": message}}


def make_handler(kit: McpServerKit, bearer_token: str | None) -> type[BaseHTTPRequestHandler]:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt: str, *args: Any) -> None:
            logger.info("%s %s", self.address_string(), fmt % args)

        def do_GET(self) -> None:
            if self.path in ("/health", "/mcp/health"):
                body = json.dumps({"ok": True, "server": kit.name, "ts": int(time.time())}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            self.send_response(404)
            self.end_headers()

        def do_POST(self) -> None:
            if self.path.rstrip("/") != "/mcp":
                self.send_response(404)
                self.end_headers()
                return

            # Inline Bearer auth (opsional) — jalur auth yang sama dengan
            # `auth` server MCP di DB (Authorization: Bearer <token>).
            if bearer_token:
                header = self.headers.get("Authorization", "")
                if header != f"Bearer {bearer_token}":
                    self.send_response(401)
                    self.end_headers()
                    logger.warning("auth gagal dari %s", self.address_string())
                    return

            length = int(self.headers.get("Content-Length") or 0)
            try:
                message = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                self._send(jsonrpc_error(None, -32700, "Parse error"))
                return

            method = message.get("method")
            request_id = message.get("id")

            if method == "initialize":
                self._send(
                    jsonrpc_result(
                        request_id,
                        {
                            "protocolVersion": "2025-06-18",
                            "capabilities": {"tools": {}},
                            "serverInfo": {"name": kit.name, "version": kit.version},
                        },
                    ),
                    session=True,
                )
                return

            if method == "notifications/initialized":
                self._send(None, status=202)
                return

            if method == "ping":
                self._send(jsonrpc_result(request_id, {}))
                return

            if method == "tools/list":
                self._send(
                    jsonrpc_result(
                        request_id,
                        {
                            "tools": [
                                {
                                    "name": t.name,
                                    "description": t.description,
                                    "inputSchema": t.input_schema,
                                }
                                for t in kit.tools
                            ]
                        },
                    )
                )
                return

            if method == "tools/call":
                params = message.get("params") or {}
                name = params.get("name")
                args = params.get("arguments") or {}
                tool = next((t for t in kit.tools if t.name == name), None)
                if tool is None:
                    self._send(jsonrpc_error(request_id, -32602, f"Unknown tool: {name}"))
                    return
                try:
                    value = tool.handler(args if isinstance(args, dict) else {})
                    self._send(jsonrpc_result(request_id, _tool_ok(value)))
                except McpToolError as exc:
                    self._send(jsonrpc_result(request_id, _tool_err(str(exc))))
                except Exception as exc:  # noqa: BLE001 - tool tidak boleh mematikan server
                    logger.exception("tool %s gagal", name)
                    self._send(jsonrpc_result(request_id, _tool_err(f"internal error: {exc}")))
                return

            if request_id is not None:
                self._send(jsonrpc_error(request_id, -32601, f"Method not found: {method}"))
            else:
                self._send(None, status=202)

        def _send(self, payload: dict[str, Any] | None, status: int = 200, session: bool = False) -> None:
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            if session:
                self.send_header(SESSION_HEADER, f"orvexa-{uuid.uuid4().hex[:12]}")
            body = b"" if payload is None else json.dumps(payload, default=str).encode()
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if body:
                self.wfile.write(body)

    return Handler


def _tool_ok(value: Any) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": _to_text(value)}], "isError": False}


def _tool_err(message: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _to_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def serve(kit: McpServerKit, default_port: int) -> None:
    """Jalankan server MCP di 0.0.0.0:<port> (env MCP_PORT menimpa)."""
    port = int(os.environ.get("MCP_PORT", default_port))
    bearer = os.environ.get("MCP_BEARER_TOKEN", "").strip() or None
    server = ThreadingHTTPServer(("0.0.0.0", port), make_handler(kit, bearer))
    logger.info("%s MCP server listening on :%d (tools=%d, auth=%s)",
                kit.name, port, len(kit.tools), "on" if bearer else "off")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
