/**
 * Utilitas MCP (F6-01) — *pure*, tanpa DB, agar mudah diuji.
 *
 * Peran modul ini:
 *  - Memetakan tool MCP (`mcp_tools`) menjadi `ToolSpec` yang dimengerti
 *    worker (key `mcp.<server>.<tool>`), dengan gate akses fail-closed
 *    dari `agent_mcp_access.allowed_tools`.
 *  - Menyediakan permission key per tool MCP agar ikut dievaluasi oleh
 *    permission matrix (F5-01) + override `agent_permissions`.
 *  - Ekspansi *deferred* placeholder `${CREDENTIALS.<id>}` pada argumen
 *    tool — kredensial hanya di-inject saat tool benar-benar dieksekusi,
 *    tidak pernah bocor ke konteks run / prompt / audit.
 */

import { decryptSecret } from "./crypto";
import {
  evaluateCondition,
  findOverride,
  type AgentPermissionRow,
  type EvalContext,
  type PermissionEffect,
} from "./permissions";

export const MCP_TOOL_PREFIX = "mcp.";

export type McpTransport = "stdio" | "sse" | "http";

/** Bentuk baris `mcp_servers` yang dibutuhkan (subset, dari Drizzle). */
export type McpServerRow = {
  id: string;
  companyId: string;
  name: string;
  transport: string;
  endpoint: string | null;
  command: string | null;
  authCipher: string | null;
  authIv: string | null;
  isEnabled: boolean;
  config: unknown;
};

/** Baris `mcp_tools` (subset). */
export type McpToolRow = {
  toolName: string;
  description: string | null;
  inputSchema: unknown;
  riskLevel: string;
  requiresApproval: boolean;
  isEnabled: boolean;
};

/** Baris `agent_mcp_access` (subset) — null = tidak ada grant. */
export type McpAccessRow = {
  allowedTools: string[];
} | null;

/** Spec tool MCP yang dikirim ke worker via konteks run. */
export type McpToolSpec = {
  key: string; // "mcp.<server>.<tool>"
  description: string;
  parameters: Record<string, unknown>;
  permission: string;
  requires_approval: boolean;
  mcp: {
    server_id: string;
    server_name: string;
    tool_name: string;
  };
};

// ============================================================
// Key & permission
// ============================================================

/** Key tool MCP yang dipakai worker & permission matrix. */
export function mcpToolKey(serverName: string, toolName: string): string {
  return `${MCP_TOOL_PREFIX}${serverName}.${toolName}`;
}

/**
 * Permission key untuk tool MCP — memaksa override per agent ditulis
 * spesifik per server+tool (mis. `mcp.prometheus.query`).
 */
export function mcpPermissionFor(serverName: string, toolName: string): string {
  return mcpToolKey(serverName, toolName);
}

// ============================================================
// Function-calling name mapping
// ============================================================

/** Nama fungsi JSON-RPC aman — dipakai worker di tool spec.
 *  Hanya [a-zA-Z0-9_] agar tidak ambigu dengan separator `__` (simetris
 *  dengan `_safe_fn_part` di worker/orchestrator/strategy.py). */
export function mcpFnName(serverName: string, toolName: string): string {
  const safe = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "_");
  return `mcp__${safe(serverName)}__${safe(toolName)}`;
}

/** Parse balik nama fungsi → {server, tool}, atau null bila bukan tool MCP. */
export function parseMcpFnName(fnName: string): { server: string; tool: string } | null {
  const m = /^mcp__([a-zA-Z0-9_-]+)__([a-zA-Z0-9_-]+)$/.exec(fnName);
  if (!m) return null;
  return { server: m[1], tool: m[2] };
}

// ============================================================
// Gate akses & sanitasi
// ============================================================

/**
 * Gate fail-closed `agent_mcp_access.allowed_tools`:
 * tanpa row grant → tidak boleh; `["*"]` = semua tool server ini.
 */
export function checkMcpToolAccess(access: McpAccessRow, toolName: string): boolean {
  if (!access) return false;
  const list = Array.isArray(access.allowedTools) ? access.allowedTools : [];
  return list.includes(toolName) || list.includes("*");
}

const SECRET_FIELD_RE = /secret|token|password|authorization|api_key|credential/i;

/**
 * Sanitasi argumen tool untuk audit log / preview approval:
 * field bernama sensitif direduksi, string panjang dipotong.
 */
export function sanitizeMcpToolArgs(
  args: Record<string, unknown>,
  maxLen = 200,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args ?? {})) {
    if (SECRET_FIELD_RE.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    if (typeof value === "string" && value.length > maxLen) {
      out[key] = `${value.slice(0, maxLen)}…(${value.length} chars)`;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.map((v) =>
        typeof v === "string" && v.length > maxLen
          ? `${v.slice(0, maxLen)}…(${v.length} chars)`
          : v,
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

// ============================================================
// Deferred credential injection
// ============================================================

const CREDENTIAL_REF_RE = /^\$\{CREDENTIALS\.([A-Za-z0-9_-]+)\}$/;

/** Deteksi apakah argumen/schema memakai placeholder kredensial. */
export function hasCredentialRef(value: unknown): boolean {
  if (typeof value === "string") return CREDENTIAL_REF_RE.test(value);
  if (Array.isArray(value)) return value.some(hasCredentialRef);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(hasCredentialRef);
  }
  return false;
}

/** Kumpulkan semua credential id yang dirujuk placeholder di argumen. */
export function collectCredentialIds(value: unknown): string[] {
  const ids: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === "string") {
      const m = CREDENTIAL_REF_RE.exec(v);
      if (m && !ids.includes(m[1])) ids.push(m[1]);
      return;
    }
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v !== null && typeof v === "object") {
      Object.values(v).forEach(walk);
    }
  };
  walk(value);
  return ids;
}

/**
 * Ekspansi `${CREDENTIALS.<id>}` di seluruh nilai argumen.
 * Resolver mengembalikan plaintext atau null (null → placeholder dibiarkan;
 * validasi skema tool yang akan menolaknya).
 */
export function evalMcpArgs(
  args: Record<string, unknown>,
  resolveCredential: (credentialId: string) => string | null,
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      const m = CREDENTIAL_REF_RE.exec(value);
      if (m) return resolveCredential(m[1]) ?? value;
      return value;
    }
    if (Array.isArray(value)) return value.map(walk);
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]));
    }
    return value;
  };
  return walk(args) as Record<string, unknown>;
}

// ============================================================
// Spec builder
// ============================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Risiko di atas medium → wajib approval meski row bilang tidak. */
export function riskRequiresApproval(riskLevel: string): boolean {
  return riskLevel === "high" || riskLevel === "critical";
}

export function normalizeTransport(raw: string): McpTransport {
  return raw === "stdio" || raw === "sse" || raw === "http" ? raw : "http";
}

/**
 * Bangun `McpToolSpec` untuk satu tool MCP.
 * Return null bila:
 *  - server/tool disabled, atau
 *  - agent tidak punya grant `agent_mcp_access` untuk tool ini (fail-closed).
 */
export function makeMcpToolSpec(
  server: McpServerRow,
  tool: McpToolRow,
  access: McpAccessRow,
): McpToolSpec | null {
  if (!server.isEnabled || !tool.isEnabled) return null;
  if (!checkMcpToolAccess(access, tool.toolName)) return null;

  return {
    key: mcpToolKey(server.name, tool.toolName),
    description:
      tool.description?.trim() ||
      `Tool MCP "${tool.toolName}" dari server "${server.name}".`,
    parameters: isPlainObject(tool.inputSchema) ? tool.inputSchema : { type: "object" },
    permission: mcpPermissionFor(server.name, tool.toolName),
    requires_approval: tool.requiresApproval || riskRequiresApproval(tool.riskLevel),
    mcp: {
      server_id: server.id,
      server_name: server.name,
      tool_name: tool.toolName,
    },
  };
}

/**
 * Dekripsi auth server MCP (fail-closed: gagal dekripsi → null, tanpa auth).
 */
export function mcpServerAuth(
  row: { authCipher: string | null; authIv: string | null },
): string | null {
  if (!row.authCipher || !row.authIv) return null;
  try {
    return decryptSecret({ cipher: row.authCipher, iv: row.authIv });
  } catch {
    return null;
  }
}

// ============================================================
// F6-06 — keputusan permission khusus tool MCP
// ============================================================

export type McpPermissionInput = {
  riskLevel?: string;
  requiresApproval?: boolean;
};

/**
 * Keputusan izin untuk satu tool MCP (F6-06).
 *
 * Urutan:
 *  1. Override `agent_permissions` untuk key `mcp.<server>.<tool>` → menang
 *     (kondisi gagal / tak ter-evaluasi → fail-closed approval_required).
 *  2. Tanpa override → default berbasis risiko (fail-closed):
 *     risk `high`/`critical` atau `requiresApproval` → approval_required;
 *     `low`/`medium` → allow (tool MCP bawaan Orvexa semuanya read-only).
 *
 * Berbeda dengan `evaluatePermission()` builtin: tool MCP tidak dikenal
 * matrix TIDAK otomatis disabled — katalog tool ada di DB (`mcp_tools`) dan
 * sudah lolos gate enabled + grant; default-nya mengikuti risk level.
 */
export function evaluateMcpPermission(
  serverName: string,
  toolName: string,
  input: McpPermissionInput,
  rows: AgentPermissionRow[] = [],
  ctx: EvalContext = {},
): { effect: PermissionEffect; source: "default" | "agent_override"; reason?: string } {
  const key = mcpPermissionFor(serverName, toolName);
  const override = findOverride(rows, key);
  if (override) {
    if (override.effect === "allow") {
      const verdict = evaluateCondition(override.conditions, ctx);
      if (verdict === false || verdict === null) {
        return {
          effect: "approval_required",
          source: "agent_override",
          reason: "Kondisi override tidak terpenuhi / tidak bisa dievaluasi (fail-closed).",
        };
      }
    }
    return { effect: override.effect, source: "agent_override", reason: "Override per agent." };
  }

  if (riskRequiresApproval(input.riskLevel ?? "low")) {
    return {
      effect: "approval_required",
      source: "default",
      reason: `Tool MCP berisiko ${input.riskLevel} wajib persetujuan manusia.`,
    };
  }
  if (input.requiresApproval) {
    return {
      effect: "approval_required",
      source: "default",
      reason: "Tool MCP ditandai wajib approval.",
    };
  }
  return {
    effect: "allow",
    source: "default",
    reason: "Tool MCP read-only berisiko rendah.",
  };
}
