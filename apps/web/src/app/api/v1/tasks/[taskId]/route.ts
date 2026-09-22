import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { enqueueAgentJob } from "@/lib/jobs";
import { db } from "@/lib/db";
import { activityLogs, taskDependencies, tasks } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { updateTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ taskId: string }> };

/** Sinkronkan completedAt dengan status. */
function completionTimestamp(status: string, current: Date | null): Date | null {
  if (status === "done") return current ?? new Date();
  return null;
}

export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { taskId } = await params;
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, auth.company!.id), isNull(tasks.deletedAt)))
    .limit(1);
  if (!row) return apiError("NOT_FOUND", "Task tidak ditemukan.", 404);

  const deps = await db
    .select({ dependsOnId: taskDependencies.dependsOnId })
    .from(taskDependencies)
    .where(eq(taskDependencies.taskId, taskId));

  const blockers = await db
    .select({ taskId: taskDependencies.taskId })
    .from(taskDependencies)
    .where(eq(taskDependencies.dependsOnId, taskId));

  return apiOk({ task: row, depends_on: deps.map((d) => d.dependsOnId), blockers: blockers.map((b) => b.taskId) });
}

export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.assign");
  if (denied) return denied;

  const { taskId } = await params;
  const parsed = updateTaskSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  // Ambil kondisi sebelum update untuk deteksi perubahan assignee.
  const [previous] = await db
    .select({ id: tasks.id, assignedAgentId: tasks.assignedAgentId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, auth.company!.id)))
    .limit(1);

  const [row] = await db
    .update(tasks)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      ...(data.status !== undefined
        ? { status: data.status, completedAt: completionTimestamp(data.status, null) }
        : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.project_id !== undefined ? { projectId: data.project_id ?? null } : {}),
      ...(data.assigned_agent_id !== undefined
        ? { assignedAgentId: data.assigned_agent_id ?? null }
        : {}),
      ...(data.assigned_user_id !== undefined ? { assignedUserId: data.assigned_user_id ?? null } : {}),
      ...(data.assigned_team_id !== undefined ? { assignedTeamId: data.assigned_team_id ?? null } : {}),
      ...(data.due_date !== undefined ? { dueDate: data.due_date ? new Date(data.due_date) : null } : {}),
      ...(data.result !== undefined ? { result: data.result ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, auth.company!.id), isNull(tasks.deletedAt)))
    .returning();

  if (!row) return apiError("NOT_FOUND", "Task tidak ditemukan.", 404);

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "task.updated",
    targetType: "task",
    targetId: row.id,
    roomId: row.roomId,
    projectId: row.projectId,
    summary: `Task diupdate: ${row.title}`,
    metadata: { changes: data as Record<string, unknown> },
  });

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "task.updated", {
      task: { id: row.id, title: row.title, priority: row.priority, status: row.status },
    });
  }

  // Task baru di-assign ke agent → picu run (F4-01/F4-02). Gagal enqueue
  // tidak boleh menggagalkan update.
  const newAssignee = data.assigned_agent_id ?? null;
  if (newAssignee && newAssignee !== previous?.assignedAgentId) {
    try {
      await enqueueAgentJob({
        companyId: auth.company!.id,
        agentId: newAssignee,
        roomId: row.roomId,
        trigger: {
          kind: "task.assigned",
          task_id: row.id,
          task_title: row.title,
          description: row.description,
          priority: row.priority,
          user_id: auth.user.id,
        },
      });
    } catch {
      // abaikan — job berikutnya tetap diproses worker
    }
  }

  return apiOk({ task: row });
}

export async function DELETE(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.delete");
  if (denied) return denied;

  const { taskId } = await params;
  const [row] = await db
    .update(tasks)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, auth.company!.id), isNull(tasks.deletedAt)))
    .returning({ id: tasks.id, roomId: tasks.roomId });

  if (!row) return apiError("NOT_FOUND", "Task tidak ditemukan.", 404);

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "task.deleted",
    targetType: "task",
    targetId: row.id,
    roomId: row.roomId,
    summary: `Task dihapus`,
  });

  return apiOk({ deleted: true, id: row.id });
}
