import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agentRuns, agents, messageThreads, messages, rooms } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { authenticateInternal } from "@/lib/internal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/internal/runs/:id/messages
 *
 * Agent mengirim pesan ke room. Pesan disimpan (author_type = agent,
 * author_run_id = run) lalu event `message.created` dipublikasikan sehingga
 * muncul realtime di UI. Kalau `thread_root_id` diisi, agregat
 * `message_threads` ikut diperbarui.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = authenticateInternal(request);
  if (denied) return denied;

  const { id } = await params;
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, id))
    .limit(1);
  if (!run) return apiError("NOT_FOUND", "Run tidak ditemukan.", 404);
  if (!run.roomId) return apiError("VALIDATION_ERROR", "Run tidak terikat ke room.", 400);

  const body = await readJson(request);
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return apiError("VALIDATION_ERROR", "content wajib diisi.", 400);

  const allowedKinds = ["text", "alert", "task", "document", "tool_call"] as const;
  type MessageKind = (typeof allowedKinds)[number];
  const kind: MessageKind = allowedKinds.includes(body.kind as MessageKind)
    ? (body.kind as MessageKind)
    : "text";
  const threadRootId = typeof body.thread_root_id === "string" ? body.thread_root_id : null;

  const [room] = await db
    .select({ id: rooms.id, companyId: rooms.companyId })
    .from(rooms)
    .where(and(eq(rooms.id, run.roomId), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const [agent] = await db
    .select({ id: agents.id, name: agents.displayName, role: agents.role })
    .from(agents)
    .where(eq(agents.id, run.agentId))
    .limit(1);

  const [message] = await db
    .insert(messages)
    .values({
      id: newId("msg"),
      companyId: room.companyId,
      roomId: room.id,
      threadRootId,
      authorType: "agent",
      authorAgentId: run.agentId,
      authorRunId: run.id,
      kind,
      content,
      mentions: Array.isArray(body.mentions) ? (body.mentions as string[]).slice(0, 50) : [],
      meta: (body.meta && typeof body.meta === "object" ? body.meta : {}) as Record<string, unknown>,
    })
    .returning();

  await db.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, room.id));

  if (threadRootId) {
    const [thread] = await db
      .select()
      .from(messageThreads)
      .where(eq(messageThreads.rootMessageId, threadRootId))
      .limit(1);
    if (thread) {
      await db
        .update(messageThreads)
        .set({
          replyCount: thread.replyCount + 1,
          lastReplyAt: new Date(),
          participantIds: [...new Set([...thread.participantIds, run.agentId])],
        })
        .where(eq(messageThreads.id, thread.id));
    } else {
      await db.insert(messageThreads).values({
        id: newId("thr"),
        roomId: room.id,
        rootMessageId: threadRootId,
        replyCount: 1,
        lastReplyAt: new Date(),
        participantIds: [run.agentId],
      });
    }
  }

  await publishRoomEvent(
    room.id,
    "message.created",
    {
      message: {
        id: message.id,
        room_id: message.roomId,
        thread_root_id: message.threadRootId,
        author_type: message.authorType,
        author_agent_id: message.authorAgentId,
        author_run_id: message.authorRunId,
        kind: message.kind,
        content: message.content,
        mentions: message.mentions,
        meta: message.meta,
        created_at: message.createdAt,
        agent_name: agent?.name ?? "Agent",
        agent_role: agent?.role ?? null,
      },
    },
    { agentId: run.agentId, runId: run.id },
  );

  return apiOk({ message }, 201);
}
