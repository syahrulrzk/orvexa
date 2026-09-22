import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { roomMembers, rooms } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { createRoomSchema } from "@/lib/validation";

export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.companyId, auth.company!.id), isNull(rooms.deletedAt)))
    .orderBy(desc(rooms.updatedAt))
    .limit(200);

  return apiOk({ rooms: rows });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "room.write");
  if (denied) return denied;

  const parsed = createRoomSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;
  const roomId = newId("rm");

  const [room] = await db
    .insert(rooms)
    .values({
      id: roomId,
      companyId: auth.company!.id,
      name: data.name,
      type: data.type,
      topic: data.topic ?? null,
      projectId: data.project_id ?? null,
      createdBy: auth.user.id,
    })
    .returning();

  // Pembuat room otomatis jadi member (lead).
  await db.insert(roomMembers).values({
    id: newId("rmm"),
    roomId,
    userId: auth.user.id,
    role: "lead",
  });

  // Agent yang di-assign saat pembuatan.
  if (data.member_agent_ids && data.member_agent_ids.length > 0) {
    await db
      .insert(roomMembers)
      .values(
        data.member_agent_ids.map((agentId) => ({
          id: newId("rmm"),
          roomId,
          agentId,
          role: "member",
        })),
      )
      .onConflictDoNothing();
  }

  return apiOk({ room }, 201);
}
