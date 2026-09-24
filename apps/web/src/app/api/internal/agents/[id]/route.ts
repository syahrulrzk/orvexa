import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agents } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { authenticateInternal } from "@/lib/internal";
import { publishOfficeEvent } from "@/lib/office";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["idle", "thinking", "working", "waiting_approval", "error", "disabled"] as const;
type AgentStatus = (typeof STATUSES)[number];

/**
 * PATCH /api/internal/agents/:id — ubah status agent.
 * Bila `room_id` dikirim, event `agent.status` juga dipublikasikan ke room
 * sehingga pill status di UI berubah realtime.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson(request);
  const status = String(body.status ?? "");

  if (!STATUSES.includes(status as AgentStatus)) {
    return apiError("VALIDATION_ERROR", `status harus salah satu dari: ${STATUSES.join(", ")}`, 400);
  }

  const [updated] = await db
    .update(agents)
    .set({ status: status as AgentStatus, updatedAt: new Date() })
    .where(eq(agents.id, id))
    .returning({ id: agents.id, status: agents.status });

  if (!updated) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);

  // Phase 10: status juga dipublikasikan ke channel global Virtual Office
  // sehingga denah ikut berubah realtime tanpa per-room subscription.
  await publishOfficeEvent("agent.status", {
    agent_id: updated.id,
    status: updated.status,
    room_id: typeof body.room_id === "string" ? body.room_id : null,
    ts: new Date().toISOString(),
  });

  const roomId = typeof body.room_id === "string" ? body.room_id : null;
  if (roomId) {
    await publishRoomEvent(
      roomId,
      "agent.status",
      { agent: { id: updated.id, status: updated.status } },
      {
        agentId: updated.id,
        runId: typeof body.run_id === "string" ? body.run_id : undefined,
      },
    );
  }

  return apiOk({ agent: updated });
}
