import { and, desc, eq, ilike, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, messages, rooms, users } from "@/lib/db/schema";

/** Escape wildcard LIKE agar input user tidak jadi pola pencarian liar. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, auth.company!.id), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return apiError("VALIDATION_ERROR", "Query minimal 2 karakter.", 400);
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
      createdAt: messages.createdAt,
      userName: users.displayName,
      agentName: agents.displayName,
      agentRole: agents.role,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .leftJoin(agents, eq(agents.id, messages.authorAgentId))
    .where(
      and(
        eq(messages.roomId, id),
        eq(messages.isDeleted, false),
        ilike(messages.content, `%${escapeLike(q)}%`),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(30);

  return apiOk({ results: rows, query: q });
}
