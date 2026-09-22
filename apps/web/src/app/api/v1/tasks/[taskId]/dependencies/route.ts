import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { taskDependencies, tasks } from "@/lib/db/schema";
import { addDependencySchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ taskId: string }> };

/** GET dependencies (task yang harus selesai dulu). */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { taskId } = await params;
  const [task] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.companyId, auth.company!.id)))
    .limit(1);
  if (!task) return apiError("NOT_FOUND", "Task tidak ditemukan.", 404);

  const rows = await db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(taskDependencies)
    .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
    .where(eq(taskDependencies.taskId, taskId));

  return apiOk({ dependencies: rows });
}

/**
 * POST tambah dependency.
 * Deteksi siklus: BFS menyusuri rantai depends_on mulai dari dependsOnId;
 * bila sampai lagi ke taskId, berarti menambah edge ini membuat siklus.
 */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.assign");
  if (denied) return denied;

  const { taskId } = await params;
  const parsed = addDependencySchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const dependsOnId = parsed.data.depends_on_id;
  if (dependsOnId === taskId) {
    return apiError("VALIDATION_ERROR", "Task tidak boleh bergantung pada dirinya sendiri.", 400);
  }

  const [target] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.id, dependsOnId), eq(tasks.companyId, auth.company!.id)))
    .limit(1);
  if (!target) return apiError("VALIDATION_ERROR", "depends_on_id tidak valid.", 400);

  const visited = new Set<string>([dependsOnId]);
  let frontier = [dependsOnId];
  let depth = 0;
  while (frontier.length > 0 && depth < 50) {
    const rows = await db
      .select({ dependsOnId: taskDependencies.dependsOnId })
      .from(taskDependencies)
      .where(inArray(taskDependencies.taskId, frontier))
      .limit(500);
    frontier = [];
    for (const r of rows) {
      if (r.dependsOnId === taskId) {
        return apiError("CONFLICT", "Dependency membentuk siklus.", 409);
      }
      if (!visited.has(r.dependsOnId)) {
        visited.add(r.dependsOnId);
        frontier.push(r.dependsOnId);
      }
    }
    depth += 1;
  }

  await db
    .insert(taskDependencies)
    .values({ taskId, dependsOnId })
    .onConflictDoNothing();

  return apiOk({ added: true, task_id: taskId, depends_on_id: dependsOnId }, 201);
}

/** DELETE hapus dependency. */
export async function DELETE(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "task.assign");
  if (denied) return denied;

  const { taskId } = await params;
  const dependsOnId = new URL(request.url).searchParams.get("depends_on_id");
  if (!dependsOnId) {
    return apiError("VALIDATION_ERROR", "Query depends_on_id wajib diisi.", 400);
  }

  await db
    .delete(taskDependencies)
    .where(
      and(eq(taskDependencies.taskId, taskId), eq(taskDependencies.dependsOnId, dependsOnId)),
    );

  return apiOk({ removed: true });
}
