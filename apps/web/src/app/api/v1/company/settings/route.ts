import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { updateCompanySettings } from "@/lib/settings";
import { updateCompanySettingsSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PATCH /api/v1/company/settings — nama, tema default, pengaturan company (settings.manage). */
export async function PATCH(request: Request) {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;
  if (!auth.company) return apiError("NO_COMPANY", "Kamu bukan anggota company mana pun.", 403);

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError("VALIDATION_ERROR", "Body bukan JSON valid.", 400);
  }

  const parsed = updateCompanySettingsSchema.safeParse(body);
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Payload tidak valid.", 422);
  }

  const updated = await updateCompanySettings(
    auth.company.id,
    parsed.data,
    { id: auth.user.id },
  );
  if (!updated) return apiError("NOT_FOUND", "Company tidak ditemukan.", 404);

  return apiOk({
    id: updated.id,
    name: updated.name,
    default_theme: updated.defaultTheme,
    settings: updated.settings,
  });
}
