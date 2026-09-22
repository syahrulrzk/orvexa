import { NextResponse } from "next/server";
import { z } from "zod";

import { apiError, apiOk, authenticate, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { messageReactions } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { loadMessageForCompany } from "@/lib/messages";

const bodySchema = z.object({
  emoji: z.string().trim().min(1).max(8),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const message = await loadMessageForCompany(id, auth.company!.id);
  if (!message) return apiError("NOT_FOUND", "Pesan tidak ditemukan.", 404);

  const parsed = bodySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Emoji tidak valid.", 400, parsed.error.issues);
  }
  const { emoji } = parsed.data;

  await db
    .insert(messageReactions)
    .values({
      id: newId("rea"),
      messageId: id,
      userId: auth.user.id,
      emoji,
    })
    .onConflictDoNothing();

  await publishRoomEvent(
    message.roomId,
    "reaction.added",
    { message_id: id, emoji, user_id: auth.user.id, name: auth.user.displayName },
  );

  return apiOk({ ok: true }, 201);
}
