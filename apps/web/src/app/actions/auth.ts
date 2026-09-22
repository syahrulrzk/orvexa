"use server";

import { signOut } from "@/lib/auth";
import { getSessionContext, revokeSession } from "@/lib/session";

/** Logout: revokasi session di DB lalu hapus cookie sesi. */
export async function logoutAction(): Promise<void> {
  const ctx = await getSessionContext();
  if (ctx) {
    await revokeSession(ctx.sessionId);
  }
  await signOut({ redirectTo: "/login" });
}
