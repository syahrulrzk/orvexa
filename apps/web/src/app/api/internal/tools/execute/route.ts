import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agentPermissions, rooms } from "@/lib/db/schema";
import { authenticateInternal } from "@/lib/internal";
import { executeTool, getToolSpec, type ToolPermissionContext } from "@/lib/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/tools/execute
 *
 * Body: `{ tool_key, args, company_id, agent_id, room_id?, run_id? }`
 *
 * Worker memanggil endpoint ini untuk semua tool. Eksekusi tetap di web agar
 * validasi, permission, audit, dan event realtime satu pintu.
 *
 * F5-01: sebelum eksekusi, route memuat override permission per agent
 * (`agent_permissions`) dan konteks room (tipe room) lalu mengevaluasi
 * permission matrix (fail-closed). `approval_required` → HTTP 202 — worker
 * memperlakukannya sebagai checkpoint approval (F5-03).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const body = await readJson(request);
  const toolKey = typeof body.tool_key === "string" ? body.tool_key : "";
  const companyId = typeof body.company_id === "string" ? body.company_id : "";
  const agentId = typeof body.agent_id === "string" ? body.agent_id : "";
  const roomId = typeof body.room_id === "string" ? body.room_id : null;

  if (!toolKey || !companyId || !agentId) {
    return apiError("VALIDATION_ERROR", "tool_key, company_id, dan agent_id wajib diisi.", 400);
  }

  const spec = getToolSpec(toolKey);
  if (!spec) {
    return apiError("NOT_FOUND", `Tool "${toolKey}" tidak terdaftar.`, 404);
  }

  // --- Konteks permission (F5-01) ---
  const permissionRows = await db
    .select({
      permission: agentPermissions.permission,
      effect: agentPermissions.effect,
      conditions: agentPermissions.conditions,
    })
    .from(agentPermissions)
    .where(eq(agentPermissions.agentId, agentId));

  let roomType: string | null = null;
  if (roomId) {
    const [room] = await db
      .select({ type: rooms.type })
      .from(rooms)
      .where(and(eq(rooms.id, roomId), eq(rooms.companyId, companyId)))
      .limit(1);
    roomType = room?.type ?? null;
  }

  const permCtx: ToolPermissionContext = { permissionRows, roomType };

  const args = (body.args && typeof body.args === "object" ? body.args : {}) as Record<
    string,
    unknown
  >;

  const result = await executeTool(
    toolKey,
    args,
    {
      companyId,
      agentId,
      roomId,
      runId: typeof body.run_id === "string" ? body.run_id : null,
    },
    permCtx,
  );

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