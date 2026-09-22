import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { companyMembers, users } from "@/lib/db/schema";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const updateMemberRoleSchema = z.object({
  role: z.enum(["owner", "admin", "manager", "member", "viewer"]),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: companyMembers.id,
      user_id: companyMembers.userId,
      role: companyMembers.role,
      joined_at: companyMembers.joinedAt,
      user_name: users.displayName,
      user_email: users.email,
    })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, auth.company!.id))
    .orderBy(desc(companyMembers.joinedAt));

  return apiOk({ members: rows });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  // Members are typically added via invitation flow, not direct creation
  // This endpoint can be used for adding existing users to company
  const parsed = z.object({
    user_id: z.string(),
    role: z.enum(["admin", "manager", "member", "viewer"]),
  }).safeParse(await readJson(request));

  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Check if user exists
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, data.user_id))
    .limit(1);

  if (!user) {
    return apiError("NOT_FOUND", "User tidak ditemukan.", 404);
  }

  // Check if already a member
  const [existing] = await db
    .select({ id: companyMembers.id })
    .from(companyMembers)
    .where(and(
      eq(companyMembers.companyId, auth.company!.id),
      eq(companyMembers.userId, data.user_id)
    ))
    .limit(1);

  if (existing) {
    return apiError("CONFLICT", "User sudah menjadi member.", 409);
  }

  const [row] = await db
    .insert(companyMembers)
    .values({
      id: `cm_${Date.now()}`,
      companyId: auth.company!.id,
      userId: data.user_id,
      role: data.role,
    })
    .returning();

  return apiOk({ member: row }, 201);
}
