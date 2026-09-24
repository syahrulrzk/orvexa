#!/usr/bin/env python3
"""Mock MCP server (F6-01) — JSON-RPC 2.0 over Streamable HTTP.

Dipakai untuk verifikasi offline MCP client worker + seed demo tools,
tanpa perlu server MCP sungguhan (Prometheus/Grafana/dst).

Jalankan:
    python3 scripts/dev/mock-mcp-server.py --port 8091

Lalu seed dengan MCP_DEMO_URL=http://localhost:8091/mcp agar server "demo"
terdaftar di DB dengan 2 tool (echo, now) + grant ke agent NOC.

Protocol: initialize → notifications/initialized → tools/list → tools/call.
Mendukung header Mcp-Session-Id (dikembalikan di respons initialize).
"""

from __future__ import annotations

import argparse
import json
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

PROTOCOL_VERSION = "2025-06-18"

TOOLS = [
    {
        "name": "echo",
        "description": "Kembalikan pesan yang dikirim (uji konektivitas MCP).",
        "inputSchema": {
            "type": "object",
            "properties": {"message": {"type": "string"}},
            "required": ["message"],
            "additionalProperties": False,
        },
    },
    {
        "name": "now",
        "description": "Waktu server MCP saat ini (WIB).",
        "inputSchema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    },
    {
        "name": "add",
        "description": "Penjumlahan dua angka (uji argumen bertipe).",
        "inputSchema": {
            "type": "object",
            "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
            "required": ["a", "b"],
            "additionalProperties": False,
        },
    },
]


def handle_tool(name: str, args: dict[str, Any]) -> dict[str, Any]:
    if name == "echo":
        return {"content": [{"type": "text", "text": f"echo: {args.get('message', '')}"}]}
    if name == "now":
        return {"content": [{"type": "text", "text": time.strftime("%Y-%m-%d %H:%M:%S WIB", time.gmtime())}]}
    if name == "add":
        try:
            total = float(args.get("a", 0)) + float(args.get("b", 0))
        except (TypeError, ValueError):
            return {"content": [{"type": "text", "text": "invalid numbers"}], "isError": True}
        return {"content": [{"type": "text", "text": str(total)}]}
    return {"content": [{"type": "text", "text": f"unknown tool {name}"}], "isError": True}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
        pass  # senyapkan access log

    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length") or 0)
        try:
            message = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Parse error"}})
            return

        method = message.get("method")
        request_id = message.get("id")
        is_request = request_id is not None

        if method == "initialize":
            body = {
                "jsonrpc": "2.0",
                "id": request_id,
                "result": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "mock-mcp", "version": "1.0.0"},
                },
            }
            self._json(body, extra_headers={"Mcp-Session-Id": "mock-session-1"})
            return

        if method == "notifications/initialized":
            self._json(None, status=202)
            return

        if method == "ping":
            self._json({"jsonrpc": "2.0", "id": request_id, "result": {}})
            return

        if method == "tools/list":
            self._json({"jsonrpc": "2.0", "id": request_id, "result": {"tools": TOOLS}})
            return

        if method == "tools/call":
            params = message.get("params") or {}
            result = handle_tool(str(params.get("name")), params.get("arguments") or {})
            self._json({"jsonrpc": "2.0", "id": request_id, "result": result})
            return

        if is_request:
            self._json(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "method": method, "message": f"Method not found: {method}"},
                }
            )
            return
        self._json(None, status=202)

    def _json(self, payload: dict[str, Any] | None, status: int = 200, extra_headers: dict[str, str] | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        for key, value in (extra_headers or {}).items():
            self.send_header(key, value)
        body = b"" if payload is None else json.dumps(payload).encode()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)


def main() -> None:
    parser = argparse.ArgumentParser(description="Mock MCP server (Streamable HTTP)")
    parser.add_argument("--port", type=int, default=8091)
    args = parser.parse_args()

    server = ThreadingHTTPServer(("0.0.0.0", args.port), Handler)
    print(f"mock MCP server listening on http://0.0.0.0:{args.port}/mcp")
    server.serve_forever()


if __name__ == "__main__":
    main()
