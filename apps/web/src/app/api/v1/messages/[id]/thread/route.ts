import { and, asc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, messageThreads, messages, rooms, users } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { loadMessageForCompany } from "@/lib/messages";
import { createMessageSchema } from "@/lib/validation";

const selection = {
  id: messages.id,
  roomId: messages.roomId,
  threadRootId: messages.threadRootId,
  authorType: messages.authorType,
  authorUserId: messages.authorUserId,
  authorAgentId: messages.authorAgentId,
  kind: messages.kind,
  content: messages.content,
  mentions: messages.mentions,
  meta: messages.meta,
  createdAt: messages.createdAt,
  userName: users.displayName,
  agentName: agents.displayName,
  agentRole: agents.role,
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const message = await loadMessageForCompany(id, auth.company!.id);
  if (!message) return apiError("NOT_FOUND", "Pesan tidak ditemukan.", 404);

  const rootId = message.threadRootId ?? message.id;

  const replies = await db
    .select(selection)
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .leftJoin(agents, eq(agents.id, messages.authorAgentId))
    .where(and(eq(messages.threadRootId, rootId), eq(messages.isDeleted, false)))
    .orderBy(asc(messages.createdAt))
    .limit(200);

  return apiOk({ root_id: rootId, replies });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "message.send");
  if (denied) return denied;

  const { id } = await params;
  const message = await loadMessageForCompany(id, auth.company!.id);
  if (!message) return apiError("NOT_FOUND", "Pesan tidak ditemukan.", 404);

  const parsed = createMessageSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;
  const rootId = message.threadRootId ?? message.id;

  const [reply] = await db
    .insert(messages)
    .values({
      id: newId("msg"),
      companyId: auth.company!.id,
      roomId: message.roomId,
      threadRootId: rootId,
      authorType: "human",
      authorUserId: auth.user.id,
      kind: data.kind,
      content: data.content,
      mentions: data.mentions ?? [],
    })
    .returning();

  // Update agregat thread (idempotent increment).
  await db
    .insert(messageThreads)
    .values({
      id: newId("thr"),
      roomId: message.roomId,
      rootMessageId: rootId,
      replyCount: 1,
      lastReplyAt: new Date(),
      participantIds: [auth.user.id],
    })
    .onConflictDoUpdate({
      target: messageThreads.rootMessageId,
      set: {
        replyCount: sql`${messageThreads.replyCount} + 1`,
        lastReplyAt: new Date(),
      },
    });

  await db.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, message.roomId));

  await publishRoomEvent(message.roomId, "message.created", {
    message: {
      id: reply.id,
      room_id: reply.roomId,
      thread_root_id: rootId,
      author_type: reply.authorType,
      author_user_id: reply.authorUserId,
      author_agent_id: reply.authorAgentId,
      kind: reply.kind,
      content: reply.content,
      mentions: reply.mentions,
      created_at: reply.createdAt,
      user_name: auth.user.displayName,
    },
  });

  return apiOk({ reply }, 201);
}
