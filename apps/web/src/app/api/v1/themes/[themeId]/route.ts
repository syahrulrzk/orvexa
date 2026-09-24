import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, themes } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateThemeSchema } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function themeOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: themes.id })
    .from(themes)
    .where(and(eq(themes.id, id), eq(themes.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ themeId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { themeId } = await params;
  if (!(await themeOwned(themeId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Theme tidak ditemukan.", 404);
  }

  const [theme] = await db
    .select({
      id: themes.id,
      key: themes.key,
      name: themes.name,
      tokens: themes.tokens,
      is_builtin: themes.isBuiltin,
    })
    .from(themes)
    .where(eq(themes.id, themeId))
    .limit(1);

  if (!theme) {
    return apiError("NOT_FOUND", "Theme tidak ditemukan.", 404);
  }

  return apiOk({ theme });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ themeId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { themeId } = await params;
  if (!(await themeOwned(themeId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Theme tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const parsed = updateThemeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(themes)
    .set({
      key: data.key ?? undefined,
      name: data.name ?? undefined,
      tokens: data.tokens ?? undefined,
    })
    .where(eq(themes.id, themeId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "theme.updated",
    targetType: "theme",
    targetId: row.id,
    summary: `Theme diupdate: ${row.name}`,
    metadata: { theme_name: row.name },
  });

  return apiOk({ theme: row });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ themeId: string }> }
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { themeId } = await params;
  if (!(await themeOwned(themeId, auth.company!.id))) {
    return apiError("NOT_FOUND", "Theme tidak ditemukan.", 404);
  }

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const [row] = await db
    .delete(themes)
    .where(eq(themes.id, themeId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "theme.deleted",
    targetType: "theme",
    targetId: row.id,
    summary: `Theme dihapus: ${row.name}`,
    metadata: { theme_name: row.name },
  });

  return apiOk({ deleted: true });
}
