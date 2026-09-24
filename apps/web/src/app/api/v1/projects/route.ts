import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, projects, tasks } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { createProjectSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/projects — daftar project + hitungan task. */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.companyId, auth.company!.id), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt))
    .limit(200);

  const projectIds = rows.map((r) => r.id);

  const taskRows = projectIds.length
    ? await db
        .select({ projectId: tasks.projectId, status: tasks.status })
        .from(tasks)
        .where(and(eq(tasks.companyId, auth.company!.id), isNull(tasks.deletedAt)))
    : [];

  const withCounts = rows.map((p) => {
    const pts = taskRows.filter((t) => t.projectId === p.id);
    return {
      ...p,
      task_count: pts.length,
      task_done: pts.filter((t) => t.status === "done").length,
    };
  });

  return apiOk({ projects: withCounts });
}

/** POST /api/v1/projects — buat project baru. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.create");
  if (denied) return denied;

  const parsed = createProjectSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(projects)
    .values({
      id: newId("prj"),
      companyId: auth.company!.id,
      name: data.name,
      description: data.description ?? null,
      status: data.status,
      ownerTeamId: data.owner_team_id ?? null,
      startDate: data.start_date ?? null,
      targetDate: data.target_date ?? null,
      createdBy: auth.user.id,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "project.created",
    targetType: "project",
    targetId: row.id,
    summary: `Project dibuat: ${row.name}`,
    metadata: { project_name: row.name, status: row.status },
  });

  return apiOk({ project: row }, 201);
}
