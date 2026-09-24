import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, projects } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { updateProjectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ projectId: string }> };

/** PATCH project. */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.create");
  if (denied) return denied;

  const { projectId } = await params;
  const [existing] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, auth.company!.id), isNull(projects.deletedAt)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Project tidak ditemukan.", 404);

  const parsed = updateProjectSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .update(projects)
    .set({
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.owner_team_id !== undefined ? { ownerTeamId: data.owner_team_id ?? null } : {}),
      ...(data.start_date !== undefined ? { startDate: data.start_date ?? null } : {}),
      ...(data.target_date !== undefined ? { targetDate: data.target_date ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, projectId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "project.updated",
    targetType: "project",
    targetId: projectId,
    summary: `Project diupdate: ${row.name}`,
    metadata: { fields: Object.keys(data) },
  });

  return apiOk({ project: row });
}

/** DELETE project — soft delete. Task tidak ikut terhapus (projectId jadi null). */
export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.delete");
  if (denied) return denied;

  const { projectId } = await params;
  const [existing] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.companyId, auth.company!.id), isNull(projects.deletedAt)))
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Project tidak ditemukan.", 404);

  const [row] = await db
    .update(projects)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning({ id: projects.id, name: projects.name });

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "project.deleted",
    targetType: "project",
    targetId: projectId,
    summary: `Project dihapus: ${existing.name}`,
    metadata: { project_name: existing.name },
  });

  return apiOk({ deleted: true, project: row });
}
