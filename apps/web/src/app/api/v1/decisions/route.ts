import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, decisions } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { createDecisionSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/decisions — daftar keputusan company. */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(decisions)
    .where(and(eq(decisions.companyId, auth.company!.id)))
    .orderBy(desc(decisions.createdAt))
    .limit(200);

  return apiOk({ decisions: rows });
}

/** POST /api/v1/decisions — catat keputusan (DRL). Code auto DEC-XXXX. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.assign");
  if (denied) return denied;

  const parsed = createDecisionSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Generate kode berurutan DEC-0001, DEC-0002, ...
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(decisions)
    .where(eq(decisions.companyId, auth.company!.id));
  const code = data.code ?? `DEC-${String(count + 1).padStart(4, "0")}`;

  const [row] = await db
    .insert(decisions)
    .values({
      id: newId("dec"),
      companyId: auth.company!.id,
      projectId: data.project_id ?? null,
      roomId: data.room_id ?? null,
      approvalId: data.approval_id ?? null,
      code,
      title: data.title,
      rationale: data.rationale ?? null,
      status: data.status ?? "proposed",
      participants: data.participants ?? [],
      approvedBy: data.status === "approved" ? auth.user.id : null,
      decidedAt: data.status === "approved" ? new Date() : null,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "decision.created",
    targetType: "decision",
    targetId: row.id,
    roomId: row.roomId,
    projectId: row.projectId,
    summary: `Keputusan ${row.code}: ${row.title}`,
  });

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "decision.created", {
      decision: { id: row.id, code: row.code, title: row.title, status: row.status },
    });
  }

  return apiOk({ decision: row }, 201);
}
