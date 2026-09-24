import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { logActivity } from "@/lib/activity";
import { revokeAllUserSessions, revokeSession } from "@/lib/session-store";
import { revokeSessionsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/security/sessions — daftar sesi aktif user (tidak expired/tidak direvokasi). */
export async function GET() {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select({
      id: sessions.id,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      lastSeenAt: sessions.lastSeenAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(eq(sessions.userId, auth.user.id), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())),
    )
    .orderBy(desc(sessions.createdAt));

  return apiOk(
    rows.map((r) => ({
      id: r.id,
      ip_address: r.ipAddress,
      user_agent: r.userAgent,
      created_at: r.createdAt,
      last_seen_at: r.lastSeenAt,
      expires_at: r.expiresAt,
    })),
  );
}

/**
 * DELETE /api/v1/security/sessions — revoke sesi.
 * Tanpa body → sesi saat ini saja. `session_id` → sesi tertentu (milik sendiri).
 * `all: true` → semua sesi user (logout dari semua perangkat; butuh session.revoke).
 */
export async function DELETE(request: Request) {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  // Body opsional — empty body berarti revoke sesi saat ini.
  let raw: unknown = undefined;
  try {
    const text = await request.text();
    if (text.trim().length > 0) raw = JSON.parse(text);
  } catch {
    return apiError("VALIDATION_ERROR", "Body bukan JSON valid.", 400);
  }

  const parsed = revokeSessionsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload tidak valid.", 422);
  }

  const { session_id: sessionId, all } = parsed.data;

  if (all) {
    if (!auth.company) return apiError("NO_COMPANY", "Kamu bukan anggota company mana pun.", 403);
    const denied = guardPermission(auth, "settings.manage");
    if (denied) return denied;
    await revokeAllUserSessions(auth.user.id);
    await logActivity({
      companyId: auth.company.id,
      actor: { type: "human", userId: auth.user.id },
      action: "security.sessions_revoked_all",
      targetType: "user",
      targetId: auth.user.id,
    });
    return apiOk({ revoked: "all" });
  }

  if (sessionId) {
    const [row] = await db
      .select({ userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, sessionId))
      .limit(1);
    if (!row || row.userId !== auth.user.id) {
      return apiError("NOT_FOUND", "Sesi tidak ditemukan atau bukan milikmu.", 404);
    }
    await revokeSession(sessionId);
    return apiOk({ revoked: sessionId });
  }

  // Default: revoke sesi saat ini (logout).
  await revokeSession(auth.sessionId);
  return apiOk({ revoked: auth.sessionId ?? "current" });
}
