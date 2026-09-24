import { and, desc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { ProjectManager } from "@/components/projects/project-manager";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { projects, tasks } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";

export default async function ProjectsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Projects">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const rows = await db
    .select()
    .from(projects)
    .where(and(eq(projects.companyId, companyId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.createdAt))
    .limit(100);

  const taskRows = await db
    .select({ projectId: tasks.projectId, status: tasks.status })
    .from(tasks)
    .where(and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt)));

  const projectRows = rows.map((p) => {
    const pts = taskRows.filter((t) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      startDate: p.startDate,
      targetDate: p.targetDate,
      taskCount: pts.length,
      taskDone: pts.filter((t) => t.status === "done").length,
    };
  });

  const canManage = hasPermission(ctx.company!.role, "task.create");
  const totalTasks = projectRows.reduce((n, p) => n + p.taskCount, 0);

  return (
    <AppShell
      title="Projects"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Project aktif</span>
                <span className="font-medium text-fg">
                  {projectRows.filter((p) => p.status === "active").length}
                </span>
              </li>
              <li className="flex justify-between">
                <span>Total project</span>
                <span className="font-medium text-fg">{projectRows.length}</span>
              </li>
              <li className="flex justify-between">
                <span>Task terkait</span>
                <span className="font-medium text-fg">{totalTasks}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Project mengelompokkan task, room, dokumen, dan keputusan dalam satu inisiatif. Assign task ke
              agent dari board Tasks untuk memicunya bekerja.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Projects</h2>
            <p className="text-sm text-fg-muted">Kelompokkan task, room, dokumen, dan keputusan dalam satu inisiatif.</p>
          </div>
          <Badge variant="outline">{projectRows.length} project</Badge>
        </div>

        <ProjectManager projects={projectRows} canManage={canManage} />
      </div>
    </AppShell>
  );
}
