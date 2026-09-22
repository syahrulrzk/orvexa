import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, roomMembers, rooms } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { addRoomMemberSchema } from "@/lib/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "room.write");
  if (denied) return denied;

  const { id } = await params;
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, auth.company!.id), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const parsed = addRoomMemberSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const { agent_id, user_id, role } = parsed.data;

  if (agent_id) {
    const [agent] = await db
      .select()
      .from(agents)
      .where(
        and(eq(agents.id, agent_id), eq(agents.companyId, auth.company!.id), isNull(agents.deletedAt)),
      )
      .limit(1);
    if (!agent) return apiError("NOT_FOUND", "Agent tidak ditemukan.", 404);
  }

  const [member] = await db
    .insert(roomMembers)
    .values({
      id: newId("rmm"),
      roomId: id,
      agentId: agent_id ?? null,
      userId: user_id ?? null,
      role,
    })
    .returning();

  return apiOk({ member }, 201);
}
