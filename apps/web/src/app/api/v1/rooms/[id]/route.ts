import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, roomMembers, rooms, users } from "@/lib/db/schema";
import { updateRoomSchema } from "@/lib/validation";

async function loadRoom(roomId: string, companyId: string) {
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
    .limit(1);
  return room ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const room = await loadRoom(id, auth.company!.id);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const members = await db
    .select({
      id: roomMembers.id,
      role: roomMembers.role,
      joinedAt: roomMembers.joinedAt,
      userId: roomMembers.userId,
      agentId: roomMembers.agentId,
      userName: users.displayName,
      userEmail: users.email,
      agentName: agents.displayName,
      agentRole: agents.role,
      agentStatus: agents.status,
    })
    .from(roomMembers)
    .leftJoin(users, eq(users.id, roomMembers.userId))
    .leftJoin(agents, eq(agents.id, roomMembers.agentId))
    .where(eq(roomMembers.roomId, id));

  return apiOk({ room, members });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "room.write");
  if (denied) return denied;

  const { id } = await params;
  const room = await loadRoom(id, auth.company!.id);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const parsed = updateRoomSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (parsed.data.name !== undefined) patch.name = parsed.data.name;
  if (parsed.data.topic !== undefined) patch.topic = parsed.data.topic;
  if (parsed.data.is_archived !== undefined) patch.isArchived = parsed.data.is_archived;

  const [updated] = await db.update(rooms).set(patch).where(eq(rooms.id, id)).returning();
  return apiOk({ room: updated });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "room.manage");
  if (denied) return denied;

  const { id } = await params;
  const room = await loadRoom(id, auth.company!.id);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  await db
    .update(rooms)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(rooms.id, id));

  return apiOk({ ok: true });
}
