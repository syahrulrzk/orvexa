"""MCP client (F6-01) — JSON-RPC 2.0 dengan dua transport.

Mendukung:
- ``http``  : Streamable HTTP (POST /mcp, respons JSON atau SSE). Header
              ``Mcp-Session-Id`` dipertahankan untuk server yang mengharuskan
              sesi. Ini transport default untuk Prometheus/Grafana/Wazuh/dst.
- ``stdio`` : spawn proses (mis. ``docker exec ...`` / binary lokal), handshake
              di stdin/stdout. Dipakai untuk server di host yang sama.

Client ini *stateless per-call* untuk HTTP (satu koneksi baru per pemanggilan
tool, cukup untuk MVP) dan *stateful per-instance* untuk stdio (proses
dipertahankan). Keputusan desain (R-027): eksekusi tool MCP di worker, tetapi
IZIN tetap satu pintu di web via `/api/internal/mcp/authorize`.
"""

from __future__ import annotations

import asyncio
import json
import logging
import shlex
import uuid
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("orvexa.mcp")

PROTOCOL_VERSION = "2025-06-18"
CLIENT_INFO = {"name": "orvexa-worker", "version": "1.0.0"}

_JSONRPC_PARSE_ERROR = -32700
_JSONRPC_INTERNAL_ERROR = -32603


class McpError(RuntimeError):
    """Error MCP generik (transport, protokol, atau tool error)."""

    def __init__(self, message: str, *, code: str = "MCP_ERROR") -> None:
        super().__init__(message)
        self.code = code


@dataclass
class McpServerConfig:
    """Connection detail yang diterima dari `/api/internal/mcp/authorize`."""

    transport: str = "http"
    endpoint: str | None = None
    command: str | None = None
    auth: str | None = None
    headers: dict[str, str] = field(default_factory=dict)
    timeout_seconds: float = 30.0

    @staticmethod
    def from_payload(payload: dict[str, Any]) -> "McpServerConfig":
        return McpServerConfig(
            transport=str(payload.get("transport") or "http"),
            endpoint=payload.get("endpoint"),
            command=payload.get("command"),
            auth=payload.get("auth"),
            headers={
                str(k): str(v)
                for k, v in (payload.get("headers") or {}).items()
                if isinstance(v, (str, int, float))
            },
            timeout_seconds=float(payload.get("timeout_seconds") or 30.0),
        )


@dataclass
class McpToolResult:
    """Hasil `tools/call` yang sudah di-flatten jadi teks untuk LLM."""

    ok: bool
    text: str
    raw: dict[str, Any]


class McpClient:
    """Klien MCP minimal (initialize + tools/call)."""

    def __init__(self, config: McpServerConfig) -> None:
        self._config = config
        self._session_id: str | None = None
        self._initialized = False
        self._process: asyncio.subprocess.Process | None = None
        self._id_counter = 0

    # ------------------------------------------------------------------
    # JSON-RPC
    # ------------------------------------------------------------------

    def _next_id(self) -> int:
        self._id_counter += 1
        return self._id_counter

    def _request(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        req: dict[str, Any] = {"jsonrpc": "2.0", "id": self._next_id(), "method": method}
        if params is not None:
            req["params"] = params
        return req

    # ------------------------------------------------------------------
    # Transport HTTP (Streamable HTTP)
    # ------------------------------------------------------------------

    def _http_headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            **self._config.headers,
        }
        if self._config.auth:
            headers["Authorization"] = f"Bearer {self._config.auth}"
        if self._session_id:
            headers["Mcp-Session-Id"] = self._session_id
        return headers

    async def _post_http(self, request: dict[str, Any]) -> dict[str, Any] | list[Any] | None:
        if not self._config.endpoint:
            raise McpError("Server MCP http tanpa endpoint.")
        url = self._config.endpoint
        async with httpx.AsyncClient(timeout=self._config.timeout_seconds) as client:
            resp = await client.post(url, json=request, headers=self._http_headers())

        sid = resp.headers.get("mcp-session-id")
        if sid:
            self._session_id = sid

        if resp.status_code == 202:
            return None
        if resp.status_code >= 400:
            raise McpError(f"HTTP {resp.status_code} dari MCP server: {resp.text[:300]}")

        ctype = resp.headers.get("content-type", "")
        if "text/event-stream" in ctype:
            return self._parse_sse_body(resp.text)
        try:
            return resp.json()
        except json.JSONDecodeError as exc:
            raise McpError(f"Respons MCP server bukan JSON: {resp.text[:200]}") from exc

    @staticmethod
    def _parse_sse_body(body: str) -> dict[str, Any] | None:
        """Ambil pesan JSON dari stream SSE (format Streamable HTTP)."""
        data_lines: list[str] = []
        for line in body.splitlines():
            if line.startswith("data:"):
                data_lines.append(line[5:].strip())
        if not data_lines:
            raise McpError("SSE tanpa data.")
        raw = "\n".join(data_lines)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise McpError(f"SSE data bukan JSON valid: {raw[:200]}") from exc
        if isinstance(parsed, dict):
            return parsed
        return None

    # ------------------------------------------------------------------
    # Transport stdio
    # ------------------------------------------------------------------

    async def _ensure_process(self) -> asyncio.subprocess.Process:
        if self._process is not None and self._process.returncode is None:
            return self._process
        if not self._config.command:
            raise McpError("Server MCP stdio tanpa command.")
        argv = shlex.split(self._config.command)
        try:
            self._process = await asyncio.create_subprocess_exec(
                *argv,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
        except OSError as exc:
            raise McpError(f"Gagal spawn proses MCP: {exc}") from exc
        return self._process

    async def _post_stdio(self, request: dict[str, Any]) -> dict[str, Any] | None:
        proc = await self._ensure_process()
        assert proc.stdin is not None and proc.stdout is not None
        line = json.dumps(request, separators=(",", ":")) + "\n"
        try:
            proc.stdin.write(line.encode())
            await proc.stdin.drain()
        except (BrokenPipeError, ConnectionResetError) as exc:
            raise McpError("Proses MCP mati saat menulis request.") from exc

        while True:
            raw = await asyncio.wait_for(proc.stdout.readline(), timeout=self._config.timeout_seconds)
            if not raw:
                returncode = proc.returncode
                stderr = b""
                if proc.stderr is not None:
                    try:
                        stderr = await asyncio.wait_for(proc.stderr.read(2000), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass
                raise McpError(f"Proses MCP berhenti (rc={returncode}): {stderr.decode(errors='replace')[:300]}")
            text = raw.decode().strip()
            if not text:
                continue
            try:
                message = json.loads(text)
            except json.JSONDecodeError:
                continue  # bukan JSON-RPC (log/noise) — buang
            if isinstance(message, dict) and message.get("id") == request["id"]:
                return message

    # ------------------------------------------------------------------
    # Protokol
    # ------------------------------------------------------------------

    async def _send(self, request: dict[str, Any]) -> dict[str, Any] | None:
        if self._config.transport == "stdio":
            return await self._post_stdio(request)
        return await self._post_http(request)

    async def _initialize(self) -> None:
        if self._initialized:
            return
        init_req = self._request(
            "initialize",
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": CLIENT_INFO,
            },
        )
        resp = await self._send(init_req)
        if resp is None:
            raise McpError("Tidak ada respons initialize dari MCP server.")
        if "error" in resp:
            raise McpError(f"initialize ditolak: {resp['error']}")

        # Server boleh mengirim notification `notifications/initialized`
        # terlebih dahulu — abaikan; kirim notification kita (tanpa id).
        notification = {"jsonrpc": "2.0", "method": "notifications/initialized"}
        if self._config.transport == "stdio":
            proc = await self._ensure_process()
            assert proc.stdin is not None
            try:
                proc.stdin.write((json.dumps(notification, separators=(",", ":")) + "\n").encode())
                await proc.stdin.drain()
            except (BrokenPipeError, ConnectionResetError):
                pass
        else:
            # HTTP: beberapa server mengharapkan notification; kegagalan
            # dikabaikan karena opsional.
            try:
                await self._post_http(notification)
            except McpError:
                pass
        self._initialized = True

    async def _ensure_initialized(self) -> None:
        if not self._initialized:
            await self._initialize()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def call_tool(self, tool_name: str, args: dict[str, Any]) -> McpToolResult:
        """Handshake (bila perlu) lalu `tools/call`; hasil di-flatten jadi teks."""
        await self._ensure_initialized()
        request = self._request("tools/call", {"name": tool_name, "arguments": args})
        resp = await self._send(request)
        if resp is None:
            raise McpError("Tidak ada respons dari MCP server.")
        if "error" in resp:
            err = resp["error"]
            raise McpError(f"tools/call error: {err.get('message', err)}", code="MCP_TOOL_ERROR")

        result = resp.get("result") or {}
        return _flatten_tool_result(result)

    async def list_tools(self) -> list[dict[str, Any]]:
        """Untuk sinkronisasi katalog `mcp_tools` (dipakai route refresh di F6-02+)."""
        await self._ensure_initialized()
        resp = await self._send(self._request("tools/list", {}))
        if resp is None:
            raise McpError("Tidak ada respons tools/list dari MCP server.")
        if "error" in resp:
            raise McpError(f"tools/list error: {resp['error']}")
        tools = (resp.get("result") or {}).get("tools") or []
        return [t for t in tools if isinstance(t, dict)]

    async def ping(self) -> bool:
        try:
            await self._ensure_initialized()
            resp = await self._send(self._request("ping", {}))
            return resp is not None and "error" not in resp
        except (McpError, asyncio.TimeoutError, httpx.HTTPError) as exc:
            logger.debug("ping MCP gagal: %s", exc)
            return False

    async def close(self) -> None:
        proc = self._process
        if proc is not None and proc.returncode is None:
            try:
                if proc.stdin is not None:
                    proc.stdin.close()
                await asyncio.wait_for(proc.wait(), timeout=5.0)
            except (asyncio.TimeoutError, ProcessLookupError):
                proc.kill()


def _extract_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return json.dumps(value, ensure_ascii=False, default=str)
    return str(value)


def _flatten_tool_result(result: dict[str, Any]) -> McpToolResult:
    """Flatten konten MCP (list of {type: text|json|...}) menjadi teks tunggal."""
    content = result.get("content") or []
    is_error = bool(result.get("isError"))
    parts: list[str] = []
    for item in content:
        if not isinstance(item, dict):
            parts.append(_extract_text(item))
            continue
        ctype = item.get("type")
        if ctype == "text":
            parts.append(str(item.get("text") or ""))
        elif ctype == "json":
            parts.append(json.dumps(item.get("json"), ensure_ascii=False, default=str))
        elif ctype == "resource":
            resource = item.get("resource") or {}
            parts.append(_extract_text(resource.get("text") or resource.get("uri")))
        else:
            parts.append(_extract_text(item))
    text = "\n".join(p for p in parts if p)
    if not text:
        text = json.dumps(result, ensure_ascii=False, default=str)
    return McpToolResult(ok=not is_error, text=text[:8000], raw=result)
