import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/api";
import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";

/**
 * Typing indicator bersifat ephemeral (tidak disimpan).
 * Klien mengirim maksimal ~1x / 2 detik saat mengetik.
 */
export async function POST(
  _request: Request,
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

  await publishRoomEvent(id, "typing", {
    user_id: auth.user.id,
    name: auth.user.displayName,
  });

  return apiOk({ ok: true });
}
