import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { authenticateInternal } from "@/lib/internal";
import { executeTool, getToolSpec } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/tools/execute
 *
 * Body: `{ tool_key, args, company_id, agent_id, room_id?, run_id? }`
 *
 * Worker memanggil endpoint ini untuk semua tool. Eksekusi tetap di web agar
 * validasi, permission, audit, dan event realtime satu pintu.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const body = await readJson(request);
  const toolKey = typeof body.tool_key === "string" ? body.tool_key : "";
  const companyId = typeof body.company_id === "string" ? body.company_id : "";
  const agentId = typeof body.agent_id === "string" ? body.agent_id : "";

  if (!toolKey || !companyId || !agentId) {
    return apiError("VALIDATION_ERROR", "tool_key, company_id, dan agent_id wajib diisi.", 400);
  }

  const spec = getToolSpec(toolKey);
  if (!spec) {
    return apiError("NOT_FOUND", `Tool "${toolKey}" tidak terdaftar.`, 404);
  }

  const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<
    string,
    unknown
  >;

  const result = await executeTool(toolKey, args, {
    companyId,
    agentId,
    roomId: typeof body.room_id === "string" ? body.room_id : null,
    runId: typeof body.run_id === "string" ? body.run_id : null,
  });

  if (result.requires_approval) {
    return NextResponse.json({ data: result }, { status: 202 });
  }
  if (!result.ok) {
    return apiError("INTERNAL_ERROR", result.error ?? "Tool gagal dieksekusi.", 400, {
      tool_key: toolKey,
    });
  }
  return apiOk(result);
}
