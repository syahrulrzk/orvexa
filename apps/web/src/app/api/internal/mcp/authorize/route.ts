import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import {
  agentMcpAccess,
  agentPermissions,
  mcpServers,
  mcpTools,
  rooms,
} from "@/lib/db/schema";
import { authenticateInternal } from "@/lib/internal";
import {
  collectCredentialIds,
  evalMcpArgs,
  hasCredentialRef,
  mcpServerAuth,
  mcpToolKey,
  normalizeTransport,
  sanitizeMcpToolArgs,
} from "@/lib/mcp";
import { evaluatePermission, type AgentPermissionRow } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/mcp/authorize
 *
 * Body: `{ server_id, tool_name, args, company_id, agent_id, room_id?, run_id? }`
 *
 * F6-01: satu pintu dari worker untuk memanggil tool MCP. Urutan keputusan
 * (fail-closed):
 *  1. Server & tool harus enabled, company cocok.
 *  2. Grant `agent_mcp_access` wajib ada untuk tool ini.
 *  3. Permission matrix (F5-01): unknown tool → disabled; `approval_required`
 *     → HTTP 202 (worker sudah paham pola ini sejak F5-03).
 *  4. Placeholder `${CREDENTIALS.<id>}` diekspansi *di sini* (deferred) —
 *     kredensial tidak pernah masuk konteks run, prompt, maupun audit log.
 *
 * Web TIDAK mengeksekusi tool MCP (R-027 tetap berlaku untuk builtin saja):
 * keputusan `allow` mengembalikan *connection details + args ter-injeksi*
 * agar MCP client di worker (F6-01) yang memanggil server. Web tetap
 * satu pintu untuk izin & audit; transport tetap di runtime.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const body = await readJson(request);
  const serverId = typeof body.server_id === "string" ? body.server_id : "";
  const toolName = typeof body.tool_name === "string" ? body.tool_name : "";
  const companyId = typeof body.company_id === "string" ? body.company_id : "";
  const agentId = typeof body.agent_id === "string" ? body.agent_id : "";
  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  const runId = typeof body.run_id === "string" ? body.run_id : null;

  if (!serverId || !toolName || !companyId || !agentId) {
    return apiError("VALIDATION_ERROR", "server_id, tool_name, company_id, dan agent_id wajib diisi.", 400);
  }

  const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<string, unknown>;

  // --- 1. Server + tool (fail-closed) ---
  const [server] = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.companyId, companyId)))
    .limit(1);
  if (!server || !server.isEnabled) {
    return apiError("NOT_FOUND", `Server MCP "${serverId}" tidak ditemukan / disabled.`, 404);
  }

  const [tool] = await db
    .select()
    .from(mcpTools)
    .where(and(eq(mcpTools.mcpServerId, server.id), eq(mcpTools.toolName, toolName)))
    .limit(1);
  if (!tool || !tool.isEnabled) {
    return apiError("NOT_FOUND", `Tool MCP "${toolName}" tidak terdaftar / disabled.`, 404);
  }

  // --- 2. Grant agent_mcp_access (fail-closed) ---
  const [access] = await db
    .select({ allowedTools: agentMcpAccess.allowedTools })
    .from(agentMcpAccess)
    .where(and(eq(agentMcpAccess.agentId, agentId), eq(agentMcpAccess.mcpServerId, server.id)))
    .limit(1);
  const allowed = access?.allowedTools ?? [];
  if (!allowed.includes(toolName) && !allowed.includes("*")) {
    await logActivity({
      companyId,
      actor: { type: "agent", agentId },
      action: "mcp.tool.denied",
      targetType: "mcp_tool",
      targetId: mcpToolKey(server.name, toolName),
      roomId,
      summary: `Akses tool MCP ${toolName} ditolak: tidak ada grant agent_mcp_access.`,
      metadata: { server: server.name, tool: toolName, run_id: runId },
    });
    return apiError("FORBIDDEN", "Agent tidak punya akses ke tool MCP ini.", 403);
  }

  // --- 3. Permission matrix (F5-01, fail-closed) ---
  const permRows: AgentPermissionRow[] = await db
    .select({
      permission: agentPermissions.permission,
      effect: agentPermissions.effect,
      conditions: agentPermissions.conditions,
    })
    .from(agentPermissions)
    .where(eq(agentPermissions.agentId, agentId));

  let roomType: string | null = null;
  let projectId: string | null = null;
  if (roomId) {
    const [room] = await db
      .select({ type: rooms.type, projectId: rooms.projectId })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
      .limit(1);
    roomType = room?.type ?? null;
    projectId = room?.projectId ?? null;
  }

  const permissionKey = mcpToolKey(server.name, toolName);
  const decision = evaluatePermission(permissionKey, permRows, { roomType, projectId });
  const needsApproval = decision.effect !== "allow" || tool.requiresApproval || ["high", "critical"].includes(tool.riskLevel);

  if (decision.effect === "disabled") {
    return apiError("FORBIDDEN", "Tool ini dinonaktifkan oleh permission matrix.", 403);
  }
  if (needsApproval) {
    await logActivity({
      companyId,
      actor: { type: "agent", agentId },
      action: "mcp.tool.approval_required",
      targetType: "mcp_tool",
      targetId: permissionKey,
      roomId,
      summary: `Tool MCP ${toolName} (server ${server.name}) butuh approval.`,
      metadata: { args: sanitizeMcpToolArgs(args), server: server.name, tool: toolName, risk: tool.riskLevel },
    });
    return NextResponse.json(
      {
        data: {
          ok: false,
          key: permissionKey,
          requires_approval: true,
          error: "Tool MCP ini butuh approval manusia.",
        },
      },
      { status: 202 },
    );
  }

  // --- 4. Deferred credential injection + serahkan ke MCP client worker ---
  const serverAuth = mcpServerAuth(server);

  // Preload semua kredensial yang dirujuk placeholder `${CREDENTIALS.<id>}`
  // (lookup async via DB) sebelum ekspansi synchronous. Placeholder yang
  // gagal diresolusi dibiarkan utuh agar kegagalan terlihat jelas di runtime.
  const resolvedCredentials = new Map<string, string>();
  if (hasCredentialRef(args)) {
    const { resolveCredentialPlaintext } = await import("@/lib/credentials");
    for (const id of collectCredentialIds(args)) {
      const plaintext = await resolveCredentialPlaintext(companyId, id);
      if (plaintext) resolvedCredentials.set(id, plaintext);
    }
  }

  const resolvedArgs = evalMcpArgs(args, (id) => resolvedCredentials.get(id) ?? null);

  const config = (server.config ?? {}) as Record<string, unknown>;
  const headers =
    typeof config.headers === "object" && config.headers !== null && !Array.isArray(config.headers)
      ? (config.headers as Record<string, string>)
      : {};

  await logActivity({
    companyId,
    actor: { type: "agent", agentId },
    action: "mcp.tool.authorized",
    targetType: "mcp_tool",
    targetId: permissionKey,
    roomId,
    summary: `Tool MCP ${toolName} (server ${server.name}) diizinkan.`,
    metadata: { args: sanitizeMcpToolArgs(args), run_id: runId },
  });

  return apiOk({
    ok: true,
    key: permissionKey,
    args: resolvedArgs,
    mcp: {
      server_id: server.id,
      server_name: server.name,
      tool_name: toolName,
      transport: normalizeTransport(server.transport),
      endpoint: server.endpoint,
      command: server.command,
      auth: serverAuth,
      headers,
      timeout_seconds: typeof config.timeout_seconds === "number" ? config.timeout_seconds : 30,
    },
  });
}
