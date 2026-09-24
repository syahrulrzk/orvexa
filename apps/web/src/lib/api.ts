import { NextResponse } from "next/server";

import { getSessionContext, type SessionContext } from "./session";
import { hasPermission, type Permission } from "./rbac";

export type ApiErrorCode =
  | "UNAUTHENTICATED"
  | "NO_COMPANY"
  | "PERMISSION_DENIED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "INTERNAL_ERROR";

export function apiError(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: unknown,
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export function apiOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ data }, { status });
}

/**
 * Autentikasi route handler. Kembalikan SessionContext, atau NextResponse error.
 * Pemakaian: `const auth = await authenticate(); if (auth instanceof NextResponse) return auth;`
 */
export async function authenticate(): Promise<SessionContext | NextResponse> {
  const ctx = await getSessionContext();
  if (!ctx) {
    return apiError("UNAUTHENTICATED", "Belum login atau sesi tidak valid.", 401);
  }
  if (!ctx.company) {
    return apiError("NO_COMPANY", "User belum tergabung di company mana pun.", 403);
  }
  return ctx;
}

/** Cek permission; kembalikan NextResponse bila ditolak, atau null bila boleh. */
export function guardPermission(ctx: SessionContext, permission: Permission): NextResponse | null {
  if (!ctx.company || !hasPermission(ctx.company.role, permission)) {
    return apiError("PERMISSION_DENIED", `Butuh permission "${permission}".`, 403, {
      required: permission,
    });
  }
  return null;
}

/** Parse JSON body dengan aman. */
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
