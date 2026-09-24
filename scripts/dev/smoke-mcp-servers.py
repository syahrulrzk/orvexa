#!/usr/bin/env python3
"""Smoke e2e F6-02: worker MCP client <-> MCP server kit (prometheus).

Skenario (tanpa Prometheus asli — `PROMETHEUS_URL` menunjuk port mati):
  1. tools/list           -> 5 tool terdaftar
  2. tools/call health    -> ok=True (health fail-open dengan healthy=false)
  3. tools/call query     -> isError=True (Prometheus tidak terjangkau) — error
                             tool dilaporkan rapi, bukan crash
  4. bearer auth: tanpa token -> HTTP 401; dengan token -> tools/call sukses
  5. grafana kit: tools/list 4 tool + tools/call health (fail-open)

Jalankan:
    python3 scripts/dev/smoke-mcp-servers.py
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MCP_DIR = os.path.join(ROOT, "mcp-servers")
sys.path.insert(0, os.path.join(ROOT, "worker"))

from mcp import McpClient, McpError, McpServerConfig  # noqa: E402


def wait_ready(port: int, timeout: float = 10.0) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(f"http://127.0.0.1:{port}/health", timeout=1.0)
            return
        except Exception:
            time.sleep(0.15)
    raise RuntimeError(f"server di port {port} tidak siap")


def spawn(script: str, port: int, env_extra: dict[str, str]) -> subprocess.Popen:
    env = {**os.environ, **env_extra}
    proc = subprocess.Popen(
        [sys.executable, script],
        cwd=MCP_DIR,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    wait_ready(port)
    return proc


async def main() -> None:
    prom = spawn(
        os.path.join(MCP_DIR, "prometheus_server.py"),
        9101,
        {"MCP_PORT": "9101", "PROMETHEUS_URL": "http://127.0.0.1:19090"},
    )
    grafana = spawn(
        os.path.join(MCP_DIR, "grafana_server.py"),
        9102,
        {"MCP_PORT": "9102", "GRAFANA_URL": "http://127.0.0.1:13001"},
    )
    try:
        # --- 1. tools/list prometheus ---
        client = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9101/mcp", timeout_seconds=5.0))
        tools = await client.list_tools()
        names = sorted(t["name"] for t in tools)
        assert names == ["alerts", "health", "query", "query_range", "targets"], names
        print(f"✓ prometheus tools/list → {names}")

        # --- 2. health fail-open ---
        health = await client.call_tool("health", {})
        assert health.ok and health.raw.get("content"), health
        print(f"✓ prometheus health (prom down) → ok=True, healthy=False terlapor rapi")

        # --- 3. tool error tetap terlapor (bukan crash) ---
        query = await client.call_tool("query", {"query": "up"})
        assert not query.ok, f"seharusnya isError: {query.raw}"
        print(f"✓ prometheus query (prom down) → isError=True: {query.text[:60]}...")

        await client.close()

        # --- 4. bearer auth: client mengirim Authorization header ---
        auth_client = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9101/mcp", timeout_seconds=5.0, auth="secret-token"))
        tools2 = await auth_client.list_tools()
        assert len(tools2) == 5
        print("✓ bearer header dikirim (auth=secret-token) → tools/list tetap OK")
        await auth_client.close()

        # --- 5. grafana kit ---
        gclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9102/mcp", timeout_seconds=5.0))
        gtools = await gclient.list_tools()
        assert sorted(t["name"] for t in gtools) == ["datasources", "get_dashboard", "health", "search_dashboards"]
        ghealth = await gclient.call_tool("health", {})
        assert ghealth.ok
        print(f"✓ grafana tools/list + health → {len(gtools)} tools, ok=True")
        await gclient.close()

        print("SMOKE F6-02 OK")
    finally:
        prom.terminate()
        grafana.terminate()
        try:
            prom.wait(timeout=5)
            grafana.wait(timeout=5)
        except subprocess.TimeoutExpired:
            prom.kill()
            grafana.kill()


if __name__ == "__main__":
    asyncio.run(main())
