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


class TestWazuhTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("wazuh_server_test", "wazuh_server.py")
        self.mod._TOKEN = None  # reset cache token antar test

    def test_token_cached(self) -> None:
        fake = FakeResponse(200, {"data": {"token": "jwt-abc"}})
        with mock.patch.object(self.mod.httpx, "post", return_value=fake) as m:
            tok1 = self.mod._get_token()
            tok2 = self.mod._get_token()
        self.assertEqual(tok1, "jwt-abc")
        self.assertEqual(tok2, "jwt-abc")
        self.assertEqual(m.call_count, 1)  # kedua panggilan pakai cache

    def test_agents_shape(self) -> None:
        fake_auth = FakeResponse(200, {"data": {"token": "jwt-abc"}})
        fake = FakeResponse(200, {"data": {"affected_items": [
            {"id": "001", "name": "web01", "status": "active", "os": {"name": "Ubuntu"}, "ip": "10.0.0.5"},
        ], "total_affected_items": 1}})
        def fake_get(url, **kw):
            return fake_auth if "/security" in url else fake
        with mock.patch.object(self.mod.httpx, "post", return_value=fake_auth), \
             mock.patch.object(self.mod.httpx, "get", side_effect=fake_get):
            out = self.mod.tool_agents({"status": "active"})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["agents"][0]["name"], "web01")

    def test_vulnerabilities_requires_agent(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_vulnerabilities({})

    def test_401_retries_with_new_token(self) -> None:
        fake_auth = FakeResponse(200, {"data": {"token": "jwt-new"}})
        calls = {"get": 0}
        def fake_get(url, **kw):
            calls["get"] += 1
            if calls["get"] == 1:
                return FakeResponse(401, {}, text="unauthorized")
            return FakeResponse(200, {"data": {"agent_status": {"active": 3}, "total_agents": 3}})
        with mock.patch.object(self.mod.httpx, "post", return_value=fake_auth), \
             mock.patch.object(self.mod.httpx, "get", side_effect=fake_get):
            out = self.mod.tool_agent_summary({})
        self.assertEqual(out["active"], 3)
        self.assertEqual(calls["get"], 2)

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


class TestDockerTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("docker_server_test", "docker_server.py")

    def test_containers_shape(self) -> None:
        items = [
            {"Id": "abc123def456", "Names": ["/orvexa-web"], "Image": "orvexa-web", "State": "running", "Status": "Up 2 hours"},
            {"Id": "xyz789", "Names": ["/orvexa-worker"], "Image": "orvexa-worker", "State": "exited", "Status": "Exited (0)"},
        ]
        with mock.patch.object(self.mod, "_docker_request", return_value=items):
            out = self.mod.tool_containers({})
        self.assertEqual(out["total"], 2)
        self.assertEqual(out["running"], 1)
        self.assertEqual(out["containers"][0]["name"], "orvexa-web")
        self.assertEqual(out["containers"][0]["id"], "abc123def456")

    def test_inspect_requires_container(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_inspect({})

    def test_inspect_shape(self) -> None:
        info = {
            "Id": "a" * 64, "Name": "/orvexa-web",
            "State": {"Status": "running", "Running": True, "Health": {"Status": "healthy"}, "RestartCount": 0},
            "Config": {"Image": "orvexa-web:latest"},
            "NetworkSettings": {"IPAddress": "172.20.0.5"},
            "Mounts": [{"Source": "/data", "Destination": "/app/data", "RW": True}],
        }
        with mock.patch.object(self.mod, "_docker_request", return_value=info):
            out = self.mod.tool_inspect({"container": "orvexa-web"})
        self.assertTrue(out["running"])
        self.assertEqual(out["health"], "healthy")
        self.assertEqual(out["ip"], "172.20.0.5")

    def test_dechunk(self) -> None:
        # format chunked: <size-hex>\r\n<data>\r\n ... 0\r\n\r\n
        self.assertEqual(self.mod._dechunk(b"4\r\nWiki\r\n5\r\npedia\r\n0\r\n\r\n"), b"Wikipedia")

    def test_dechunk_with_chunk_extension(self) -> None:
        # extension di baris ukuran (setelah ';') harus diabaikan
        self.assertEqual(self.mod._dechunk(b"4;ext=1\r\nWiki\r\n0\r\n\r\n"), b"Wiki")

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


class TestKubernetesTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("kubernetes_server_test", "kubernetes_server.py")

    def test_pods_shape(self) -> None:
        data = {"items": [
            {"metadata": {"name": "web-1"}, "spec": {"nodeName": "node-a"},
             "status": {"phase": "Running", "containerStatuses": [{"ready": True, "restartCount": 2}]}},
        ]}
        with mock.patch.object(self.mod, "_kubectl", return_value=data) as m:
            out = self.mod.tool_pods({"namespace": "prod"})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["pods"][0]["ready"], "1/1")
        self.assertEqual(out["pods"][0]["restarts"], 2)
        self.assertIn("prod", m.call_args.args[0])

    def test_invalid_namespace_rejected(self) -> None:
        with self.assertRaises(McpToolError):
            self.mod.tool_pods({"namespace": "a; rm -rf /"})

    def test_nodes_ready_count(self) -> None:
        data = {"items": [
            {"metadata": {"name": "n1", "labels": {"node-role.kubernetes.io/control-plane": ""}},
             "status": {"conditions": [{"type": "Ready", "status": "True"}], "nodeInfo": {"kubeletVersion": "v1.30.0"}}},
            {"metadata": {"name": "n2", "labels": {}},
             "status": {"conditions": [{"type": "Ready", "status": "False"}], "nodeInfo": {"kubeletVersion": "v1.30.0"}}},
        ]}
        with mock.patch.object(self.mod, "_kubectl", return_value=data):
            out = self.mod.tool_nodes({})
        self.assertEqual(out["ready"], 1)
        self.assertEqual(out["nodes"][0]["role"], "control-plane")
        self.assertEqual(out["nodes"][1]["role"], "worker")

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


class TestUnifiTools(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.mod = _load("unifi_server_test", "unifi_server.py")
        self.mod._COOKIE_TS = 0.0
        self.mod._CLIENT = None

    async def test_sites_shape(self) -> None:
        login = FakeResponse(200, {}, text="{}")
        sites = FakeResponse(200, {"data": [{"name": "default", "desc": "Default", "_id": "s1"}]})
        async def fake_post(url, **kw):
            return login
        async def fake_get(url, **kw):
            return sites
        with mock.patch.object(self.mod.httpx, "AsyncClient") as mc:
            client = mc.return_value
            client.post = fake_post
            client.get = fake_get
            client.cookies = {"SESSION": "x"}
            out = await self.mod.tool_sites({})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["sites"][0]["name"], "default")

    async def test_devices_requires_site(self) -> None:
        with self.assertRaises(McpToolError):
            await self.mod.tool_devices({})

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


class TestMikrotikTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("mikrotik_server_test", "mikrotik_server.py")

    def test_system_resource_shape(self) -> None:
        fake = FakeResponse(200, [{
            "version": "7.14", "board-name": "RB5009", "cpu-load": "12",
            "free-memory": str(2_000_000_000), "total-memory": str(4_000_000_000),
            "uptime": "3d4h", "cpu-count": "4",
        }])
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            out = self.mod.tool_system_resource({})
        self.assertEqual(out["version"], "7.14")
        self.assertEqual(out["free_memory_mb"], 2000.0)

    def test_routes_active_count(self) -> None:
        fake = FakeResponse(200, [
            {"dst-address": "0.0.0.0/0", "gateway": "10.0.0.1", "distance": "1", "active": "true"},
            {"dst-address": "192.168.0.0/16", "gateway": "", "active": "false"},
        ])
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            out = self.mod.tool_routes({})
        self.assertEqual(out["count"], 2)
        self.assertEqual(out["active_count"], 1)

    def test_upstream_error_maps_to_tool_error(self) -> None:
        import httpx as _httpx
        with mock.patch.object(self.mod.httpx, "get", side_effect=_httpx.ConnectError("refused")):
            with self.assertRaises(McpToolError):
                self.mod.tool_interfaces({})

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


class TestFortigateTools(unittest.TestCase):
    def setUp(self) -> None:
        self.mod = _load("fortigate_server_test", "fortigate_server.py")

    def test_missing_token_raises(self) -> None:
        self.mod.FORTIGATE_TOKEN = ""
        with self.assertRaises(McpToolError):
            self.mod.tool_system_status({})

    def test_policies_shape(self) -> None:
        self.mod.FORTIGATE_TOKEN = "tok"
        fake = FakeResponse(200, {"results": [
            {"policyid": 1, "name": "allow-lan", "srcintf": [{"name": "lan"}],
             "dstintf": [{"name": "wan"}], "action": "accept", "status": "enable", "hit_count": 42},
        ]})
        with mock.patch.object(self.mod.httpx, "get", return_value=fake) as m:
            out = self.mod.tool_firewall_policies({})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["policies"][0]["hit_count"], 42)
        self.assertIn("Bearer tok", m.call_args.kwargs["headers"]["Authorization"])

    def test_interfaces_dict_results_flattened(self) -> None:
        self.mod.FORTIGATE_TOKEN = "tok"
        fake = FakeResponse(200, {"results": {"wan1": {"id": "wan1", "ip": "1.2.3.4", "link": True}}})
        with mock.patch.object(self.mod.httpx, "get", return_value=fake):
            out = self.mod.tool_interfaces({})
        self.assertEqual(out["count"], 1)
        self.assertEqual(out["interfaces"][0]["name"], "wan1")

    def test_seed_catalog_matches_handlers(self) -> None:
        names = {s["tool_name"] for s in self.mod.SEED_TOOLS}
        self.assertEqual(names, set(self.mod.HANDLERS.keys()))
        kit_names = {t.name for t in self.mod.kit.tools}
        self.assertEqual(names, kit_names)


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
