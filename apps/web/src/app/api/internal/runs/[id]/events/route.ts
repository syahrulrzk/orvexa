import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agentEvents, agentRuns } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { authenticateInternal } from "@/lib/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENTS = 200;

/**
 * POST /api/internal/runs/:id/events
 *
 * Menyimpan jejak reasoning/tool call agent (`agent_events`) dalam batch.
 * Body: `{ agent_id?, events: [{ event_type, payload }] }`
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const { id } = await params;
  const [run] = await db
    .select({ id: agentRuns.id, companyId: agentRuns.companyId, agentId: agentRuns.agentId })
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  if (!run) return apiError("NOT_FOUND", "Run tidak ditemukan.", 404);

  const body = await readJson(request);
  const raw = Array.isArray(body.events) ? body.events : [];
  if (raw.length === 0) return apiError("VALIDATION_ERROR", "events tidak boleh kosong.", 400);
  if (raw.length > MAX_EVENTS) {
    return apiError("VALIDATION_ERROR", `Maksimal ${MAX_EVENTS} event per batch.`, 400);
  }

  const values = raw.map((item) => {
    const evt = (item ?? {}) as Record<string, unknown>;
    return {
      id: newId("aev"),
      companyId: run.companyId,
      runId: run.id,
      agentId: run.agentId,
      eventType: String(evt.event_type ?? "unknown").slice(0, 80),
      payload: (evt.payload && typeof evt.payload === "object" ? evt.payload : {}) as Record<
        string,
        unknown
      >,
    };
  });

  await db.insert(agentEvents).values(values);
  return apiOk({ inserted: values.length }, 201);
}
