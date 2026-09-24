import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { listActivityFeed } from "./activity";
import { db } from "./db";
import { agentRuns, agents, rooms, tasks } from "./db/schema";
import { publish } from "./redis";

/**
 * Virtual Office (Phase 10) — agregasi state untuk denah.
 *
 * Sumber data tetap satu: tabel yang sudah ada (agents, tasks, agent_runs,
 * rooms, activity_logs). Virtual Office hanya lapisan *presentasi*, tidak
 * ada state baru — status agent selalu mengikuti kolom `agents.status`
 * yang di-update worker saat run (idle/thinking/working/waiting_approval/
 * error/disabled).
 *
 * Department diinferensi dari peran/role agent + prompt hint (PRD: mulai
 * dari Infrastructure; departemen lain siap saat agent baru dibuat).
 */

export type OfficeAgent = {
  id: string;
  name: string;
  display_name: string;
  role: string | null;
  status: string;
  department: string;
  current_task: { id: string; title: string; priority: string } | null;
  current_room: { id: string; name: string; type: string } | null;
  last_activity: string | null;
};

export type OfficeDepartment = {
  key: string;
  name: string;
  description: string;
  agents: OfficeAgent[];
};

export type OfficeSnapshot = {
  generated_at: string;
  departments: OfficeDepartment[];
  summary: {
    total_agents: number;
    by_status: Record<string, number>;
    active_tasks: number;
  };
  recent_activity: Awaited<ReturnType<typeof listActivityFeed>>;
};

// Departemen bawaan (PRD Phase 10). "infrastructure" selalu ada.
export const DEPARTMENTS: { key: string; name: string; description: string; keywords: string[] }[] = [
  {
    key: "infrastructure",
    name: "Infrastructure",
    description: "Jaringan, server, cloud, dan keandalan sistem.",
    keywords: ["infra", "network", "sysadmin", "server", "monitoring", "noc", "cloud", "sre", "devops"],
  },
  {
    key: "security",
    name: "Security",
    description: "Keamanan, insiden keamanan, dan kepatuhan.",
    keywords: ["security", "wazuh", "firewall", "siem", "secops"],
  },
  {
    key: "management",
    name: "Management",
    description: "Koordinasi tim, delegasi, dan pelaporan.",
    keywords: ["manager", "lead", "coordinator", "koordinator"],
  },
];

/** Petakan agent ke departemen berdasar role + name (case-insensitive). */
export function inferDepartment(role: string | null, name: string): string {
  const haystack = `${role ?? ""} ${name}`.toLowerCase();
  for (const dept of DEPARTMENTS) {
    if (dept.keywords.some((k) => haystack.includes(k))) return dept.key;
  }
  return "infrastructure";
}

/**
 * Channel global Virtual Office. Dipublikasikan dari jalur status agent
 * (internal API) & activity log; dikonsumsi SSE `/api/v1/office/events`.
 */
export const OFFICE_CHANNEL = "orvexa.office";

/** Publish event ke denah (fire & forget; gagal Redis tidak boleh meledak). */
export async function publishOfficeEvent(type: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await publish(OFFICE_CHANNEL, { type, ...payload });
  } catch {
    // notifikasi realtime bersifat best-effort
  }
}

/** Snapshot denah untuk company (dipakai GET /api/v1/office). */
export async function loadOfficeSnapshot(companyId: string): Promise<OfficeSnapshot> {
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      displayName: agents.displayName,
      role: agents.role,
      status: agents.status,
      statusUpdatedAt: agents.updatedAt,
    })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)))
    .orderBy(agents.name);

  const agentIds = agentRows.map((a) => a.id);

  // Task aktif per agent (assigned, belum selesai).
  const activeTasks = agentIds.length
    ? await db
        .select({
          id: tasks.id,
          title: tasks.title,
          priority: tasks.priority,
          assignedAgentId: tasks.assignedAgentId,
          updatedAt: tasks.updatedAt,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.companyId, companyId),
            isNull(tasks.deletedAt),
            inArray(tasks.assignedAgentId, agentIds),
            inArray(tasks.status, ["backlog", "in_progress", "blocked", "review"]),
          ),
        )
        .orderBy(desc(tasks.updatedAt))
    : [];

  // Room terakhir di mana agent aktif (dari run terakhir).
  const lastRuns = agentIds.length
    ? await db
        .select({
          agentId: agentRuns.agentId,
          roomId: agentRuns.roomId,
          createdAt: agentRuns.createdAt,
          roomName: rooms.name,
          roomType: rooms.type,
        })
        .from(agentRuns)
        .leftJoin(rooms, eq(rooms.id, agentRuns.roomId))
        .where(
          and(
            eq(agentRuns.companyId, companyId),
            inArray(agentRuns.agentId, agentIds),
          ),
        )
        .orderBy(desc(agentRuns.createdAt))
        .limit(300)
    : [];
  const lastRunByAgent = new Map<string, (typeof lastRuns)[number]>();
  for (const run of lastRuns) {
    if (!lastRunByAgent.has(run.agentId)) lastRunByAgent.set(run.agentId, run);
  }

  const taskByAgent = new Map<string, (typeof activeTasks)[number]>();
  for (const t of activeTasks) {
    if (t.assignedAgentId && !taskByAgent.has(t.assignedAgentId)) {
      taskByAgent.set(t.assignedAgentId, t);
    }
  }

  const byStatus: Record<string, number> = {};
  const departments = new Map<string, OfficeDepartment>();
  for (const dept of DEPARTMENTS) {
    departments.set(dept.key, { key: dept.key, name: dept.name, description: dept.description, agents: [] });
  }

  for (const a of agentRows) {
    byStatus[a.status] = (byStatus[a.status] ?? 0) + 1;
    const deptKey = inferDepartment(a.role, a.name);
    if (!departments.has(deptKey)) {
      departments.set(deptKey, {
        key: deptKey,
        name: deptKey.charAt(0).toUpperCase() + deptKey.slice(1),
        description: "Departemen kustom.",
        agents: [],
      });
    }
    const task = taskByAgent.get(a.id);
    const run = lastRunByAgent.get(a.id);
    departments.get(deptKey)!.agents.push({
      id: a.id,
      name: a.name,
      display_name: a.displayName ?? a.name,
      role: a.role,
      status: a.status,
      department: deptKey,
      current_task: task ? { id: task.id, title: task.title, priority: task.priority } : null,
      current_room: run?.roomId ? { id: run.roomId as string, name: run.roomName ?? "Room", type: run.roomType ?? "general" } : null,
      last_activity: (run?.createdAt ?? a.statusUpdatedAt)?.toISOString?.() ?? null,
    });
  }

  const recentActivity = agentIds.length
    ? await listActivityFeed(companyId, { limit: 12 })
    : [];

  return {
    generated_at: new Date().toISOString(),
    departments: [...departments.values()].filter((d) => d.agents.length > 0 || d.key === "infrastructure"),
    summary: {
      total_agents: agentRows.length,
      by_status: byStatus,
      active_tasks: activeTasks.length,
    },
    recent_activity: recentActivity,
  };
}
