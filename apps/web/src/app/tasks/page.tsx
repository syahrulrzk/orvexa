import { and, asc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { TaskBoard } from "@/components/tasks/task-board";
import { db } from "@/lib/db";
import { agents, tasks } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";

export default async function TasksPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  const taskRows = companyId
    ? await db
        .select({
          id: tasks.id,
          title: tasks.title,
          description: tasks.description,
          status: tasks.status,
          priority: tasks.priority,
          assigned_agent_id: tasks.assignedAgentId,
          room_id: tasks.roomId,
        })
        .from(tasks)
        .where(and(eq(tasks.companyId, companyId), isNull(tasks.deletedAt)))
        .limit(300)
    : [];

  const agentRows = companyId
    ? await db
        .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
        .from(agents)
        .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)))
        .orderBy(asc(agents.name))
    : [];

  const agentOptions = agentRows.map((a) => ({ id: a.id, label: a.displayName ?? a.name }));

  return (
    <AppShell title="Tasks">
      <div className="p-6">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-foreground">Task Board</h2>
          <p className="text-xs text-muted-foreground">
            Task dari manusia &amp; agent. Task yang di-assign ke agent otomatis dipicu lewat worker.
          </p>
        </div>
        <TaskBoard tasks={taskRows} agents={agentOptions} />
      </div>
    </AppShell>
  );
}
