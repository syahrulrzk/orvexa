import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agentRuns, agents } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { authenticateInternal } from "@/lib/internal";
import { and, eq, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/runs — buat record `agent_runs` berstatus `running`.
 * Worker memanggil ini sebelum memulai loop, lalu menutupnya lewat PATCH.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const body = await readJson(request);
  const agentId = String(body.agent_id ?? "");
  if (!agentId) return apiError("VALIDATION_ERROR", "agent_id wajib diisi.", 400);

  const [agent] = await db
    .select({ id: agents.id, companyId: agents.companyId })
    .from(agents)
    .where(and(eq(agents.id, agentId), isNull(agents.deletedAt)))
    .limit(1);
  if (!agent) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);

  const [run] = await db
    .insert(agentRuns)
    .values({
      id: newId("run"),
      companyId: agent.companyId,
      agentId: agent.id,
      roomId: typeof body.room_id === "string" ? body.room_id : null,
      projectId: typeof body.project_id === "string" ? body.project_id : null,
      triggerKind: String(body.trigger_kind ?? "manual"),
      triggerRefId: typeof body.trigger_ref_id === "string" ? body.trigger_ref_id : null,
      parentRunId: typeof body.parent_run_id === "string" ? body.parent_run_id : null,
      status: "running",
      startedAt: new Date(),
    })
    .returning();

  return apiOk({ run }, 201);
}
