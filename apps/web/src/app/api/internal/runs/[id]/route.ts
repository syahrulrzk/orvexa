import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agentRuns } from "@/lib/db/schema";
import { authenticateInternal } from "@/lib/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = [
  "queued",
  "running",
  "waiting_approval",
  "completed",
  "failed",
  "cancelled",
] as const;
type RunStatus = (typeof STATUSES)[number];

/** PATCH /api/internal/runs/:id — update status/metrik run. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const { id } = await params;
  const body = await readJson(request);

  const patch: Partial<typeof agentRuns.$inferInsert> = {};

  if (body.status !== undefined) {
    const status = String(body.status);
    if (!STATUSES.includes(status as RunStatus)) {
      return apiError("VALIDATION_ERROR", `status tidak valid: ${status}`, 400);
    }
    patch.status = status as RunStatus;
    if (status === "completed" || status === "failed" || status === "cancelled") {
      patch.finishedAt = new Date();
    }
  }
  if (typeof body.step_count === "number") patch.stepCount = body.step_count;
  if (Array.isArray(body.tool_calls)) patch.toolCalls = body.tool_calls;
  if (body.state && typeof body.state === "object") patch.state = body.state;
  if (typeof body.result === "string") patch.result = body.result;
  if (typeof body.error === "string") patch.error = body.error;
  if (typeof body.duration_ms === "number") patch.durationMs = body.duration_ms;

  if (Object.keys(patch).length === 0) {
    return apiError("VALIDATION_ERROR", "Tidak ada field yang diupdate.", 400);
  }

  const [run] = await db.update(agentRuns).set(patch).where(eq(agentRuns.id, id)).returning();
  if (!run) return apiError("NOT_FOUND", "Run tidak ditemukan.", 404);

  return apiOk({ run });
}
