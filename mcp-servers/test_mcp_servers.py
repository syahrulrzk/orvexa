"""Unit test MCP servers (F6-02) — Prometheus & Grafana.

Dipakai: python3 -m unittest discover -s mcp-servers -v
Semua dependency eksternal di-mock (tanpa Prometheus/Grafana asli).
"""

from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(__file__))

from common import McpToolError  # noqa: E402


def _load(module_name: str, file_name: str):
    spec = importlib.util.spec_from_file_location(module_name, os.path.join(os.path.dirname(__file__), file_name))
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class FakeResponse:
    def __init__(self, status_code: int = 200, json_body: dict | list | None = None, text: str = "ok"):
        self.status_code = status_code
        self._json = json_body
        self.text = text

    def json(self) -> dict | list:
        if self._json is None:
            raise ValueError("no json")
        return self._json


class TestPrometheusTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("prometheus_server_test", "prometheus_server.py")

    def test_query_formats_series(self) -> None:
        fake = FakeResponse(200, {"status": "success", "data": {"resultType": "vector", "result": [
            {"metric": {"__name__": "up", "job": "node"}, "value": [1, "1"]},
        ]}})
        with mock.patch.object(self.mod.httpx, "get", return_value=fake) as m:
            out = self.mod.tool_query({"query": "up"})
        m.assert_called_once()
        self.assertEqual(out["resultType"], "vector")
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["series"][0]["metric"]["job"], "node")

    def test_query_requires_query(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_query({})

    def test_query_range_requires_all_args(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_query_range({"query": "up", "start": "1", "end": "2"})

    def test_prom_error_maps_to_tool_error(self) -> None:
        fake = FakeResponse(200, {"status": "error", "error": "bad query"})
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            with self.assertRaises(McpToolError):
                self.mod.tool_query({"query": "up"})

    def test_alerts_and_targets_shapes(self) -> None:
        alerts = FakeResponse(200, {"status": "success", "data": {"alerts": [
            {"labels": {"alertname": "HighCPU", "severity": "warning"}, "state": "active"},
        ]}})
        with mock.patch.object(self.mod.httpx, "get", return_value=alerts):
            out = self.mod.tool_alerts({})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["alerts"][0]["name"], "HighCPU")

        targets = FakeResponse(200, {"status": "success", "data": {"activeTargets": [
            {"labels": {"job": "node", "instance": "h1:9100"}, "health": "up"},
            {"labels": {"job": "db", "instance": "h2:9104"}, "health": "down", "lastError": "timeout"},
        ]}})
        with mock.patch.object(self.mod.httpx, "get", return_value=targets):
            out = self.mod.tool_targets({})
        self.assertEqual(out["up"], 1)
        self.assertEqual(out["down"], 1)
        self.assertEqual(out["targets"][1]["error"], "timeout")

    def test_unreachable_maps_to_tool_error(self) -> None:
        import httpx as _httpx
        with mock.patch.object(self.mod.httpx, "get", side_effect=_httpx.ConnectError("refused")):
            with self.assertRaises(McpToolError):
                self.mod.tool_query({"query": "up"})

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)
        for schema_name, schema in self.mod.SCHEMAS.items():
            self.assertEqual(schema.get("type"), "object", schema_name)


class TestGrafanaTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("grafana_server_test", "grafana_server.py")

    def test_search_dashboards(self) -> None:
        fake = FakeResponse(200, [{"uid": "rYdd", "title": "Node Exporter", "folderTitle": "Infra", "tags": ["node"]}], text="[]")
        with mock.patch.object(self.mod.httpx, "get", return_value=fake) as m:
            out = self.mod.tool_search({"query": "node"})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["dashboards"][0]["uid"], "rYdd")
        self.assertIn("/api/search", m.call_args.args[0])

    def test_get_dashboard_requires_uid(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_get_dashboard({})

    def test_get_dashboard_shape(self) -> None:
        fake = FakeResponse(200, {"meta": {"url": "/d/abc/node"}, "dashboard": {
            "uid": "abc", "title": "Node", "tags": ["infra"], "panels": [{"id": 1, "title": "CPU", "type": "timeseries"}],
        }})
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            out = self.mod.tool_get_dashboard({"uid": "abc"})
        self.assertEqual(out["title"], "Node")
        self.assertEqual(out["panel_count"], 1)

    def test_datasources(self) -> None:
        fake = FakeResponse(200, [{"name": "Prometheus", "type": "prometheus", "isDefault": True, "url": "http://prom:9090"}])
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            out = self.mod.tool_datasources({})
        self.assertEqual(out["count"], 1)
        self.assertTrue(out["datasources"][0]["is_default"])

    def test_health_unreachable(self) -> None:
        import httpx as _httpx
        with mock.patch.object(self.mod.httpx, "get", side_effect=_httpx.ConnectError("refused")):
            out = self.mod.tool_health({})
        self.assertFalse(out["healthy"])

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


if __name__ == "__main__":
    unittest.main()
