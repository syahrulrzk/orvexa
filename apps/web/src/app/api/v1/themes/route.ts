import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, themes, userPreferences } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createThemeSchema = z.object({
  key: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  tokens: z.record(z.string(), z.unknown()),
});

export const updateThemeSchema = z.object({
  key: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  tokens: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const builtin = url.searchParams.get("builtin") === "true";

  const conds = [eq(themes.companyId, auth.company!.id)];
  if (builtin) {
    conds.push(eq(themes.isBuiltin, true));
  } else {
    conds.push(eq(themes.isBuiltin, false));
  }

  const rows = await db
    .select({
      id: themes.id,
      key: themes.key,
      name: themes.name,
      tokens: themes.tokens,
      is_builtin: themes.isBuiltin,
    })
    .from(themes)
    .where(and(...conds))
    .orderBy(desc(themes.isBuiltin), desc(themes.id));

  return apiOk({ themes: rows });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "settings.manage");
  if (denied) return denied;

  const parsed = createThemeSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(themes)
    .values({
      companyId: auth.company!.id,
      key: data.key,
      name: data.name,
      tokens: data.tokens,
      isBuiltin: false,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "theme.created",
    targetType: "theme",
    targetId: row.id,
    summary: `Theme dibuat: ${row.name}`,
    metadata: { theme_name: row.name },
  });

  return apiOk({ theme: row }, 201);
}
