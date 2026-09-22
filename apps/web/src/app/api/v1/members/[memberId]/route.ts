import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, companyMembers } from "@/lib/db/schema";
import { updateMemberRoleSchema } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function memberOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(and(eq(companyMembers.id, id), eq(companyMembers.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

export async function PATCH(
  request: Request,
  { params }: { params: { memberId: string } }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  if (!(await memberOwned(params.memberId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Member tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const parsed = updateMemberRoleSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Prevent removing the last owner
  const [current] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(eq(companyMembers.id, params.memberId))
    .limit(1);

  if (current?.role === "owner" && data.role !== "owner") {
    // Check if there are other owners
    const ownerCount = await db
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, auth.company!.id),
        eq(companyMembers.role, "owner")
      ));

    if (ownerCount.length <= 1) {
      return apiError("PERMISSION_DENIED", "Tidak bisa mengubah role owner terakhir.", 403);
    }
  }

  const [row] = await db
    .update(companyMembers)
    .set({ role: data.role })
    .where(eq(companyMembers.id, params.memberId))
    .returning();

  await db.insert(activityLogs).values({
    id: `act_${Date.now()}`,
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "member.role_updated",
    targetType: "member",
    targetId: row.id,
    summary: `Role member diupdate ke ${data.role}`,
    metadata: { new_role: data.role },
  });

  return apiOk({ member: row });
}

export async function DELETE(
  request: Request,
  { params }: { params: { memberId: string } }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  if (!(await memberOwned(params.memberId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Member tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  // Prevent removing the last owner
  const [current] = await db
    .select({ role: companyMembers.role, userId: companyMembers.userId })
    .from(companyMembers)
    .where(eq(companyMembers.id, params.memberId))
    .limit(1);

  if (current?.role === "owner") {
    const ownerCount = await db
      .select({ id: companyMembers.id })
      .from(companyMembers)
      .where(and(
        eq(companyMembers.companyId, auth.company!.id),
        eq(companyMembers.role, "owner")
      ));

    if (ownerCount.length <= 1) {
      return apiError("PERMISSION_DENIED", "Tidak bisa menghapus owner terakhir.", 403);
    }
  }

  const [row] = await db
    .delete(companyMembers)
    .where(eq(companyMembers.id, params.memberId))
    .returning();

  await db.insert(activityLogs).values({
    id: `act_${Date.now()}`,
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "member.removed",
    targetType: "member",
    targetId: row.id,
    summary: `Member dihapus`,
    metadata: { user_id: row.userId },
  });

  return apiOk({ deleted: true });
}
