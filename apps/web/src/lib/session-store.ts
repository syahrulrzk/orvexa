import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";
import { sessions } from "./db/schema";
import { newId } from "./ids";

/** Masa berlaku session: 12 jam (lihat docs/SECURITY.md §3.1). */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/** Buat row session baru (dipanggil saat sign-in) dan kembalikan id-nya. */
export async function createSession(userId: string): Promise<{ id: string; expiresAt: Date }> {
  const id = newId("ses");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

/** Revokasi satu session (logout). */
export async function revokeSession(sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

/** Revokasi semua session milik user (force logout / ganti password). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
