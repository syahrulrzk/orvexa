import { and, desc, eq, isNull, lt } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { triggerAgentsFromMessage } from "@/lib/agent-trigger";
import { agents, messages, rooms, users } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { createMessageSchema, listMessagesQuerySchema } from "@/lib/validation";

async function loadRoomId(roomId: string, companyId: string) {
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
    .limit(1);
  return room?.id ?? null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!(await loadRoomId(id, auth.company!.id))) {
    return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);
  }

  const url = new URL(request.url);
  const parsedQuery = listMessagesQuerySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
  });
  if (!parsedQuery.success) {
    return apiError("VALIDATION_ERROR", "Query tidak valid.", 400, parsedQuery.error.issues);
  }
  const { limit, before } = parsedQuery.data;

  const filters = [eq(messages.roomId, id), eq(messages.isDeleted, false)];
  if (before) {
    filters.push(lt(messages.createdAt, new Date(before)));
  }

  const rows = await db
    .select({
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
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .leftJoin(agents, eq(agents.id, messages.authorAgentId))
    .where(and(...filters))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Kembalikan urut kronologis (naik) untuk ditampilkan.
  const data = rows.reverse();
  return apiOk({ messages: data, has_more: rows.length === limit });
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
  if (!(await loadRoomId(id, auth.company!.id))) {
    return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);
  }

  const parsed = createMessageSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [message] = await db
    .insert(messages)
    .values({
      id: newId("msg"),
      companyId: auth.company!.id,
      roomId: id,
      threadRootId: data.thread_root_id ?? null,
      authorType: "human",
      authorUserId: auth.user.id,
      kind: data.kind,
      content: data.content,
      mentions: data.mentions ?? [],
      replyToId: data.reply_to_id ?? null,
      meta: data.meta ?? {},
    })
    .returning();

  await db.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, id));

  await publishRoomEvent(id, "message.created", {
    message: {
      id: message.id,
      room_id: message.roomId,
      author_type: message.authorType,
      author_user_id: message.authorUserId,
      author_agent_id: message.authorAgentId,
      kind: message.kind,
      content: message.content,
      mentions: message.mentions,
      meta: message.meta,
      created_at: message.createdAt,
      user_name: auth.user.displayName,
      reply_to_id: message.replyToId,
    },
  });

  // Bangunkan agent yang di-mention (Fase 3). Kegagalan enqueue tidak boleh
  // menggagalkan pengiriman pesan — job hanya jalur async.
  try {
    await triggerAgentsFromMessage({
      companyId: auth.company!.id,
      roomId: id,
      messageId: message.id,
      text: data.content,
      mentions: data.mentions ?? [],
      authorUserId: auth.user.id,
      replyToId: message.replyToId,
    });
  } catch {
    // abaikan — worker akan tetap jalan untuk job berikutnya
  }

  return apiOk({ message }, 201);
}
