import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { db } from "@/lib/db";
import { roomMembers, rooms } from "@/lib/db/schema";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "room.write");
  if (denied) return denied;

  const { id, memberId } = await params;
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, auth.company!.id), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const deleted = await db
    .delete(roomMembers)
    .where(and(eq(roomMembers.id, memberId), eq(roomMembers.roomId, id)))
    .returning();

  if (deleted.length === 0) return apiError("NOT_FOUND", "Member tidak ditemukan.", 404);
  return apiOk({ ok: true });
}
