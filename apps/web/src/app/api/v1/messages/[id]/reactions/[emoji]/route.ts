import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/api";
import { db } from "@/lib/db";
import { messageReactions } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { loadMessageForCompany } from "@/lib/messages";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; emoji: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id, emoji } = await params;
  const message = await loadMessageForCompany(id, auth.company!.id);
  if (!message) return apiError("NOT_FOUND", "Pesan tidak ditemukan.", 404);

  const decoded = decodeURIComponent(emoji);

  await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, id),
        eq(messageReactions.userId, auth.user.id),
        eq(messageReactions.emoji, decoded),
      ),
    );

  await publishRoomEvent(message.roomId, "reaction.removed", {
    message_id: id,
    emoji: decoded,
    user_id: auth.user.id,
  });

  return apiOk({ ok: true });
}
