import { and, eq, gt, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "./auth";
import { db } from "./db";
import { companies, companyMembers, sessions, users } from "./db/schema";
import { hasPermission, PermissionDeniedError, type MemberRole, type Permission } from "./rbac";

export { createSession, revokeAllUserSessions, revokeSession, SESSION_TTL_MS } from "./session-store";

export type SessionContext = {
  user: { id: string; email: string; displayName: string };
  sessionId: string;
  company: { id: string; name: string; role: MemberRole } | null;
};

/**
 * Ambil konteks session yang sudah divalidasi ke database
 * (ada, belum direvokasi, belum kedaluwarsa). Return null bila tidak valid.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  const sessionId = (session as { sid?: string } | null)?.sid;
  if (!userId || !sessionId) return null;

  const [row] = await db
    .select()
    .from(sessions)
    .where(
      and(
        eq(sessions.id, sessionId),
        isNull(sessions.revokedAt),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row || row.userId !== userId) return null;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user || !user.isActive || user.deletedAt) return null;

  const [membership] = await db
    .select({
      companyId: companyMembers.companyId,
      role: companyMembers.role,
      name: companies.name,
    })
    .from(companyMembers)
    .innerJoin(companies, eq(companies.id, companyMembers.companyId))
    .where(eq(companyMembers.userId, userId))
    .limit(1);

  return {
    user: { id: user.id, email: user.email, displayName: user.displayName },
    sessionId,
    company: membership
      ? { id: membership.companyId, name: membership.name, role: membership.role }
      : null,
  };
}

/** Wajib login; kalau tidak, redirect ke /login. */
export async function requireSessionContext(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Wajib punya permission; lempar PermissionDeniedError bila tidak. */
export async function requirePermission(permission: Permission): Promise<SessionContext> {
  const ctx = await requireSessionContext();
  if (!ctx.company || !hasPermission(ctx.company.role, permission)) {
    throw new PermissionDeniedError(permission);
  }
  return ctx;
}
