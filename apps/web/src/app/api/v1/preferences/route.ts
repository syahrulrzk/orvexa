import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate } from "@/lib/api";
import { getOrCreateUserPreferences, updateUserPreferences } from "@/lib/settings";
import { updateUserPreferencesSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/preferences — preferensi user (auto-create bila belum ada). */
export async function GET() {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const prefs = await getOrCreateUserPreferences(auth.user.id);
  return apiOk({
    theme_key: prefs?.themeKey ?? "corporate_gray",
    locale: prefs?.locale ?? "id",
    notification_settings: prefs?.notificationSettings ?? {},
  });
}

/** PATCH /api/v1/preferences — update tema/locale/notifikasi (jsonb merge). */
export async function PATCH(request: Request) {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Body bukan JSON valid.", 400);
  }

  const parsed = updateUserPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload tidak valid.", 422);
  }

  const updated = await updateUserPreferences(auth.user.id, parsed.data);
  return apiOk({
    theme_key: updated.themeKey,
    locale: updated.locale,
    notification_settings: updated.notificationSettings,
  });
}
