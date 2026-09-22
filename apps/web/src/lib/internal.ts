import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "./env";
import { apiError } from "./api";

/**
 * Autentikasi request dari service internal (Python worker).
 *
 * Memakai bearer token statis `INTERNAL_API_TOKEN` dan perbandingan
 * constant-time. Route `/api/internal/*` **tidak** boleh dipakai browser.
 */
export function authenticateInternal(request: Request): NextResponse | null {
  const expected = env.INTERNAL_API_TOKEN?.trim();

  if (!expected) {
    return apiError(
      "INTERNAL_ERROR",
      "INTERNAL_API_TOKEN belum diset — internal API dinonaktifkan.",
      503,
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) {
    return apiError("UNAUTHENTICATED", "Bearer token internal wajib diisi.", 401);
  }

  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return apiError("UNAUTHENTICATED", "Token internal tidak valid.", 401);
  }

  return null;
}
