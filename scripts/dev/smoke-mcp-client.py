#!/usr/bin/env python3
"""Smoke test MCP client (F6-01) terhadap mock server.

Jalankan:
    python3 scripts/dev/mock-mcp-server.py --port 8091 &
    python3 scripts/dev/smoke-mcp-client.py
"""

from __future__ import annotations

import asyncio
import sys

sys.path.insert(0, "worker")

from mcp import McpClient, McpServerConfig  # noqa: E402


async def main() -> None:
    cfg = McpServerConfig(transport="http", endpoint="http://127.0.0.1:8091/mcp", timeout_seconds=5.0)
    client = McpClient(cfg)

    tools = await client.list_tools()
    names = sorted(t["name"] for t in tools)
    assert names == ["add", "echo", "now"], f"tools/list tidak sesuai: {names}"
    print(f"✓ tools/list → {names}")

    echo = await client.call_tool("echo", {"message": "halo orvexa"})
    assert echo.ok and echo.text == "echo: halo orvexa", f"echo gagal: {echo.text}"
    print(f"✓ tools/call echo → {echo.text}")

    now = await client.call_tool("now", {})
    assert now.ok and "WIB" in now.text, f"now gagal: {now.text}"
    print(f"✓ tools/call now → {now.text}")

    add = await client.call_tool("add", {"a": 2, "b": 3})
    assert add.ok and add.text == "5.0", f"add gagal: {add.text}"
    print(f"✓ tools/call add → {add.text}")

    await client.close()
    print("SMOKE OK")


if __name__ == "__main__":
    asyncio.run(main())
