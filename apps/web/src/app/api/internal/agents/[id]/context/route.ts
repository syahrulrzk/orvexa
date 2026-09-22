import { NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api";
import { AgentNotFoundError, loadAgentContext } from "@/lib/agent-context";
import { NoProviderError } from "@/lib/credentials";
import { authenticateInternal } from "@/lib/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/agents/:id/context
 *
 * Worker memakai endpoint ini sebagai satu-satunya sumber konteks run
 * (agent, provider + secret, skills, tools, permissions, room, history).
 * Lihat docs/API_SPEC.md §7.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const { id } = await params;
  const url = new URL(request.url);

  try {
    const context = await loadAgentContext(id, {
      roomId: url.searchParams.get("room_id"),
      triggerMessageId: url.searchParams.get("trigger_message_id"),
      historyLimit: url.searchParams.get("history_limit")
        ? Number(url.searchParams.get("history_limit"))
        : undefined,
    });
    return apiOk(context);
  } catch (err) {
    if (err instanceof AgentNotFoundError) {
      return apiError("NOT_FOUND", err.message, 404);
    }
    if (err instanceof NoProviderError) {
      return apiError("CONFLICT", err.message, 409);
    }
    throw err;
  }
}
