import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, projects, rooms, taskDependencies, tasks } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { createTaskSchema, listTasksQuerySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validasi bahwa id referensi benar-benar milik company ini. */
async function projectOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

async function roomOwned(id: string, companyId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const parsed = listTasksQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    priority: url.searchParams.get("priority") ?? undefined,
    project_id: url.searchParams.get("project_id") ?? undefined,
    assigned_agent_id: url.searchParams.get("assigned_agent_id") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Query tidak valid.", 400, parsed.error.issues);
  }
  const q = parsed.data;

  const conds = [eq(tasks.companyId, auth.company!.id), isNull(tasks.deletedAt)];
  if (q.status) conds.push(eq(tasks.status, q.status));
  if (q.priority) conds.push(eq(tasks.priority, q.priority));
  if (q.project_id) conds.push(eq(tasks.projectId, q.project_id));
  if (q.assigned_agent_id) conds.push(eq(tasks.assignedAgentId, q.assigned_agent_id));

  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      project_id: tasks.projectId,
      room_id: tasks.roomId,
      assigned_agent_id: tasks.assignedAgentId,
      assigned_user_id: tasks.assignedUserId,
      assigned_team_id: tasks.assignedTeamId,
      due_date: tasks.dueDate,
      parent_task_id: tasks.parentTaskId,
      created_by_type: tasks.createdByType,
      result: tasks.result,
      created_at: tasks.createdAt,
      updated_at: tasks.updatedAt,
      completed_at: tasks.completedAt,
    })
    .from(tasks)
    .where(and(...conds))
    .orderBy(desc(tasks.createdAt))
    .limit(q.limit);

  return apiOk({ tasks: rows });
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.create");
  if (denied) return denied;

  const parsed = createTaskSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Referensi lintas-company ditolak.
  if (data.project_id && !(await projectOwned(data.project_id, auth.company!.id))) {
    return apiError("VALIDATION_ERROR", "project_id tidak valid.", 400);
  }
  if (data.room_id && !(await roomOwned(data.room_id, auth.company!.id))) {
    return apiError("VALIDATION_ERROR", "room_id tidak valid.", 400);
  }
  if (data.parent_task_id) {
    const [parent] = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.id, data.parent_task_id), eq(tasks.companyId, auth.company!.id)))
      .limit(1);
    if (!parent) return apiError("VALIDATION_ERROR", "parent_task_id tidak valid.", 400);
  }

  const [row] = await db
    .insert(tasks)
    .values({
      id: newId("tsk"),
      companyId: auth.company!.id,
      projectId: data.project_id ?? null,
      roomId: data.room_id ?? null,
      title: data.title,
      description: data.description ?? null,
      status: data.status,
      priority: data.priority,
      assignedAgentId: data.assigned_agent_id ?? null,
      assignedUserId: data.assigned_user_id ?? null,
      assignedTeamId: data.assigned_team_id ?? null,
      dueDate: data.due_date ? new Date(data.due_date) : null,
      parentTaskId: data.parent_task_id ?? null,
      createdByType: "human",
      createdByUserId: auth.user.id,
    })
    .returning();

  // Dependencies (dedup + cegah self-dependency).
  const depIds = [...new Set(data.depends_on ?? [])].filter((d) => d !== row.id);
  if (depIds.length > 0) {
    const valid = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.companyId, auth.company!.id), inArray(tasks.id, depIds)));
    if (valid.length > 0) {
      await db
        .insert(taskDependencies)
        .values(valid.map((v) => ({ taskId: row.id, dependsOnId: v.id })))
        .onConflictDoNothing();
    }
  }

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "task.created",
    targetType: "task",
    targetId: row.id,
    roomId: row.roomId,
    projectId: row.projectId,
    summary: `Task dibuat: ${row.title}`,
    metadata: { priority: row.priority, status: row.status },
  });

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "task.created", {
      task: {
        id: row.id,
        title: row.title,
        priority: row.priority,
        status: row.status,
        assigned_agent_id: row.assignedAgentId,
      },
    });
  }

  return apiOk({ task: row }, 201);
}
