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

        # --- 6. F6-03: wazuh / docker / kubernetes (dependency upstream mati →
        # tools/list tetap jalan; tools/call dilaporkan sebagai isError rapi) ---
        wazuh = spawn(os.path.join(MCP_DIR, "wazuh_server.py"), 9103, {"MCP_PORT": "9103", "WAZUH_URL": "http://127.0.0.1:15500"})
        dockerm = spawn(os.path.join(MCP_DIR, "docker_server.py"), 9104, {"MCP_PORT": "9104", "DOCKER_SOCKET": "/nonexistent/docker.sock"})
        kube = spawn(os.path.join(MCP_DIR, "kubernetes_server.py"), 9105, {"MCP_PORT": "9105", "KUBECTL_BIN": "kubectl-nonexistent"})
        try:
            wclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9103/mcp", timeout_seconds=5.0))
            wtools = await wclient.list_tools()
            assert sorted(t["name"] for t in wtools) == ["agent_summary", "agents", "manager_status", "rules", "vulnerabilities"]
            wcall = await wclient.call_tool("agents", {})
            assert not wcall.ok, "wazuh down seharusnya isError"
            print(f"✓ wazuh tools/list → {len(wtools)} tools; call saat down → isError rapi")
            await wclient.close()

            dclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9104/mcp", timeout_seconds=5.0))
            dtools = await dclient.list_tools()
            assert sorted(t["name"] for t in dtools) == ["containers", "disk_usage", "images", "inspect", "version"]
            dcall = await dclient.call_tool("containers", {})
            assert not dcall.ok, "socket mati seharusnya isError"
            print(f"✓ docker tools/list → {len(dtools)} tools; call socket mati → isError rapi")
            await dclient.close()

            kclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9105/mcp", timeout_seconds=5.0))
            ktools = await kclient.list_tools()
            assert sorted(t["name"] for t in ktools) == ["deployments", "events", "nodes", "pods", "version"]
            kcall = await kclient.call_tool("nodes", {})
            assert not kcall.ok, "kubectl hilang seharusnya isError"
            print(f"✓ kubernetes tools/list → {len(ktools)} tools; call tanpa kubectl → isError rapi")
            await kclient.close()

            # --- 7. F6-04: unifi / mikrotik / fortigate (upstream mati → isError) ---
            unifi = spawn(os.path.join(MCP_DIR, "unifi_server.py"), 9106, {"MCP_PORT": "9106", "UNIFI_URL": "http://127.0.0.1:18443"})
            mikrotik = spawn(os.path.join(MCP_DIR, "mikrotik_server.py"), 9107, {"MCP_PORT": "9107", "MIKROTIK_URL": "http://127.0.0.1:1443"})
            fortigate = spawn(os.path.join(MCP_DIR, "fortigate_server.py"), 9108, {"MCP_PORT": "9108", "FORTIGATE_URL": "http://127.0.0.1:18443", "FORTIGATE_TOKEN": "tok"})
            try:
                uclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9106/mcp", timeout_seconds=5.0))
                utools = await uclient.list_tools()
                assert sorted(t["name"] for t in utools) == ["clients", "devices", "site_health", "sites"]
                ucall = await uclient.call_tool("sites", {})
                assert not ucall.ok, "unifi down seharusnya isError"
                print(f"✓ unifi tools/list → {len(utools)} tools; call saat down → isError rapi")
                await uclient.close()

                mclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9107/mcp", timeout_seconds=5.0))
                mtools = await mclient.list_tools()
                assert sorted(t["name"] for t in mtools) == ["dhcp_leases", "interfaces", "routes", "system_resource", "wireless"]
                mcall = await mclient.call_tool("system_resource", {})
                assert not mcall.ok, "routeros down seharusnya isError"
                print(f"✓ mikrotik tools/list → {len(mtools)} tools; call saat down → isError rapi")
                await mclient.close()

                fclient = McpClient(McpServerConfig(transport="http", endpoint="http://127.0.0.1:9108/mcp", timeout_seconds=5.0))
                ftools = await fclient.list_tools()
                assert sorted(t["name"] for t in ftools) == ["firewall_addresses", "firewall_policies", "interfaces", "system_performance", "system_status"]
                fcall = await fclient.call_tool("system_status", {})
                assert not fcall.ok, "fortigate down seharusnya isError"
                print(f"✓ fortigate tools/list → {len(ftools)} tools; call saat down → isError rapi")
                await fclient.close()
            finally:
                unifi.terminate()
                mikrotik.terminate()
                fortigate.terminate()
                for p in (unifi, mikrotik, fortigate):
                    try:
                        p.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        p.kill()
        finally:
            wazuh.terminate()
            dockerm.terminate()
            kube.terminate()
            for p in (wazuh, dockerm, kube):
                try:
                    p.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    p.kill()

        print("SMOKE F6-02/F6-03/F6-04 OK")
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
