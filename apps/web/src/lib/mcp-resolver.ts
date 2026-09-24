import { and, eq } from "drizzle-orm";

import { db } from "./db";
import { agentMcpAccess, mcpServers, mcpTools } from "./db/schema";
import { makeMcpToolSpec, type McpToolSpec } from "./mcp";

/**
 * Resolver MCP sisi DB (F6-01).
 *
 * Membaca `mcp_servers` + `mcp_tools` + grant `agent_mcp_access`, lalu
 * membangun `McpToolSpec` untuk agent tertentu. Fail-closed:
 *  - server/tool disabled → tidak muncul;
 *  - tanpa grant `agent_mcp_access` → tidak muncul;
 *  - company beda → tidak muncul (filter ketat per company).
 */

export async function listMcpToolsForAgent(
  companyId: string,
  agentId: string,
): Promise<McpToolSpec[]> {
  const rows = await db
    .select({
      serverId: mcpServers.id,
      serverName: mcpServers.name,
      serverEnabled: mcpServers.isEnabled,
      toolName: mcpTools.toolName,
      description: mcpTools.description,
      inputSchema: mcpTools.inputSchema,
      riskLevel: mcpTools.riskLevel,
      requiresApproval: mcpTools.requiresApproval,
      toolEnabled: mcpTools.isEnabled,
    })
    .from(mcpTools)
    .innerJoin(mcpServers, eq(mcpServers.id, mcpTools.mcpServerId))
    .where(eq(mcpServers.companyId, companyId));

  const accessRows = await db
    .select({
      mcpServerId: agentMcpAccess.mcpServerId,
      allowedTools: agentMcpAccess.allowedTools,
    })
    .from(agentMcpAccess)
    .where(eq(agentMcpAccess.agentId, agentId));
  const accessByServer = new Map(accessRows.map((r) => [r.mcpServerId, r.allowedTools ?? []]));

  const specs: McpToolSpec[] = [];
  for (const row of rows) {
    if (!row.serverEnabled || !row.toolEnabled) continue;
    const access = accessByServer.get(row.serverId);
    if (!access) continue; // tanpa row grant → fail-closed

    const spec = makeMcpToolSpec(
      {
        id: row.serverId,
        companyId,
        name: row.serverName,
        transport: "http",
        endpoint: null,
        command: null,
        authCipher: null,
        authIv: null,
        isEnabled: row.serverEnabled,
        config: {},
      },
      {
        toolName: row.toolName,
        description: row.description,
        inputSchema: row.inputSchema,
        riskLevel: row.riskLevel,
        requiresApproval: row.requiresApproval,
        isEnabled: row.toolEnabled,
      },
      { allowedTools: access },
    );
    if (spec) specs.push(spec);
  }
  return specs;
}

/** Cek cepat: agent punya grant ke server MCP tertentu (untuk UI/audit). */
export async function agentHasMcpGrant(
  agentId: string,
  mcpServerId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: agentMcpAccess.id })
    .from(agentMcpAccess)
    .where(and(eq(agentMcpAccess.agentId, agentId), eq(agentMcpAccess.mcpServerId, mcpServerId)))
    .limit(1);
  return Boolean(row);
}
