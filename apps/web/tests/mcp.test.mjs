import assert from "node:assert/strict";
import { describe, it } from "node:test";

// Harus diset SEBELUM import modul crypto/mcp (env dibaca saat load).
process.env.ORVEXA_MASTER_KEY = "KuRk5HZ9R3+qHjsBcJzXfMS7abAmXGmSkCICu3fLWbE=";

const {
  mcpToolKey,
  mcpPermissionFor,
  mcpFnName,
  parseMcpFnName,
  checkMcpToolAccess,
  sanitizeMcpToolArgs,
  hasCredentialRef,
  collectCredentialIds,
  evalMcpArgs,
  makeMcpToolSpec,
  riskRequiresApproval,
  normalizeTransport,
  mcpServerAuth,
} = await import("../src/lib/mcp.ts");

describe("mcp F6-01 — pure utilities", () => {
  it("mcpToolKey & mcpPermissionFor konsisten", () => {
    assert.equal(mcpToolKey("prometheus", "query"), "mcp.prometheus.query");
    assert.equal(mcpPermissionFor("prometheus", "query"), "mcp.prometheus.query");
  });

  it("mcpFnName sanitasi & parse roundtrip", () => {
    const fn = mcpFnName("prom-1", "query.range");
    assert.equal(fn, "mcp__prom_1__query_range");
    const parsed = parseMcpFnName(fn);
    assert.deepEqual(parsed, { server: "prom_1", tool: "query_range" });
    assert.equal(parseMcpFnName("room__post"), null);
  });

  it("checkMcpToolAccess fail-closed", () => {
    assert.equal(checkMcpToolAccess(null, "query"), false);
    assert.equal(checkMcpToolAccess({ allowedTools: [] }, "query"), false);
    assert.equal(checkMcpToolAccess({ allowedTools: ["query"] }, "query"), true);
    assert.equal(checkMcpToolAccess({ allowedTools: ["query"] }, "other"), false);
    assert.equal(checkMcpToolAccess({ allowedTools: ["*"] }, "anything"), true);
  });

  it("sanitizeMcpToolArgs redaksi field sensitif & potong string panjang", () => {
    const long = "x".repeat(300);
    const out = sanitizeMcpToolArgs({
      query: long,
      api_key: "sk-123",
      Authorization: "Bearer abc",
      nested_ok: "short",
    });
    assert.equal(out.api_key, "[redacted]");
    assert.equal(out.Authorization, "[redacted]");
    assert.ok(String(out.query).endsWith("(300 chars)"));
    assert.equal(out.nested_ok, "short");
  });

  it("placeholder kredensial: deteksi, koleksi, dan ekspansi", () => {
    const args = { q: "up", headers: { "X-Token": "${CREDENTIALS.crd_123}" }, list: ["${CREDENTIALS.crd_456}"], keep: "${NOT_A_REF}" };
    assert.equal(hasCredentialRef(args), true);
    assert.deepEqual(collectCredentialIds(args), ["crd_123", "crd_456"]);
    const resolved = evalMcpArgs(args, (id) => (id === "crd_123" ? "secret-1" : null));
    assert.equal(resolved.headers["X-Token"], "secret-1");
    // gagal resolve → placeholder utuh (fail-visible)
    assert.equal(resolved.list[0], "${CREDENTIALS.crd_456}");
    assert.equal(resolved.keep, "${NOT_A_REF}");
  });

  it("riskRequiresApproval & normalizeTransport", () => {
    assert.equal(riskRequiresApproval("low"), false);
    assert.equal(riskRequiresApproval("medium"), false);
    assert.equal(riskRequiresApproval("high"), true);
    assert.equal(riskRequiresApproval("critical"), true);
    assert.equal(normalizeTransport("stdio"), "stdio");
    assert.equal(normalizeTransport("weird"), "http");
  });

  it("makeMcpToolSpec: fail-closed tanpa grant, disabled → null", () => {
    const server = {
      id: "mcp_1", companyId: "cmp_1", name: "prom", transport: "http",
      endpoint: "http://x/mcp", command: null, authCipher: null, authIv: null,
      isEnabled: true, config: {},
    };
    const tool = {
      toolName: "query", description: "Query metrics", inputSchema: { type: "object" },
      riskLevel: "low", requiresApproval: false, isEnabled: true,
    };
    assert.equal(makeMcpToolSpec(server, tool, null), null);
    assert.equal(makeMcpToolSpec(server, tool, { allowedTools: ["other"] }), null);

    const spec = makeMcpToolSpec(server, tool, { allowedTools: ["*"] });
    assert.ok(spec);
    assert.equal(spec.key, "mcp.prom.query");
    assert.equal(spec.permission, "mcp.prom.query");
    assert.equal(spec.requires_approval, false);
    assert.deepEqual(spec.mcp, { server_id: "mcp_1", server_name: "prom", tool_name: "query" });

    const risky = makeMcpToolSpec(server, { ...tool, riskLevel: "high" }, { allowedTools: ["query"] });
    assert.equal(risky.requires_approval, true);

    assert.equal(makeMcpToolSpec({ ...server, isEnabled: false }, tool, { allowedTools: ["*"] }), null);
    assert.equal(makeMcpToolSpec(server, { ...tool, isEnabled: false }, { allowedTools: ["*"] }), null);
  });

  it("mcpServerAuth: fail-closed saat cipher rusak", async () => {
    const { encryptSecret } = await import("../src/lib/crypto.ts");
    const enc = encryptSecret("tok_abc");
    assert.equal(mcpServerAuth({ authCipher: enc.cipher, authIv: enc.iv }), "tok_abc");
    assert.equal(mcpServerAuth({ authCipher: null, authIv: null }), null);
    assert.equal(mcpServerAuth({ authCipher: "???bukan-base64-valid-gcm", authIv: enc.iv }), null);
  });
});
