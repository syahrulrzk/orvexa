import { and, desc, eq, gt } from "drizzle-orm";

import { redactSecrets } from "./redact";
import { db } from "./db";
import { activityLogs, agents, users } from "./db/schema";
import { publishRoomEvent } from "./events";
import { newId } from "./ids";

/**
 * Activity Center (F4-07): satu pintu pencatatan aktivitas company.
 * Setiap aksi penting (task/decision/document/approval/agent) masuk ke
 * `activity_logs` lalu dipublikasikan sebagai SSE `activity.logged`
 * agar feed UI terupdate realtime.
 */

export type ActivityActor =
  | { type: "human"; userId: string }
  | { type: "agent"; agentId: string }
  | { type: "system" };

export type LogActivityInput = {
  companyId: string;
  actor: ActivityActor;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  roomId?: string | null;
  projectId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
  traceId?: string | null;
};

/** Catat aktivitas + broadcast `activity.logged` ke room terkait (bila ada). */
export async function logActivity(input: LogActivityInput): Promise<string> {
  const id = newId("act");
  // F5-05: audit log bebas secret — redaksi dilakukan di SATU PINTU ini
  // sehingga semua penulis log (28+ call site) otomatis aman.
  const safeSummary = input.summary ? (redactSecrets(input.summary) as string) : null;
  const safeMetadata = (redactSecrets(input.metadata ?? {}) ?? {}) as Record<string, unknown>;
  const [row] = await db
    .insert(activityLogs)
    .values({
      id,
      companyId: input.companyId,
      actorType: input.actor.type,
      actorUserId: input.actor.type === "human" ? input.actor.userId : null,
      actorAgentId: input.actor.type === "agent" ? input.actor.agentId : null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      roomId: input.roomId ?? null,
      projectId: input.projectId ?? null,
      summary: safeSummary,
      metadata: safeMetadata,
      traceId: input.traceId ?? null,
    })
    .returning({ createdAt: activityLogs.createdAt });

  if (input.roomId) {
    await publishRoomEvent(
      input.roomId,
      "activity.logged",
      {
        id,
        action: input.action,
        actor_type: input.actor.type,
        target_type: input.targetType ?? null,
        target_id: input.targetId ?? null,
        summary: input.summary ?? null,
        metadata: input.metadata ?? {},
        ts: row.createdAt.toISOString(),
      },
      input.actor.type === "agent" ? { agentId: input.actor.agentId } : undefined,
    );
  }

  return id;
}

export type ActivityFeedItem = {
  id: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  room_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

/** Feed aktivitas company (dipakai halaman Activity Center). */
export async function listActivityFeed(
  companyId: string,
  options: { limit?: number; after?: Date | null } = {},
): Promise<ActivityFeedItem[]> {
  const limit = Math.min(options.limit ?? 100, 300);
  const conds = [eq(activityLogs.companyId, companyId)];
  if (options.after) conds.push(gt(activityLogs.createdAt, options.after));

  const rows = await db
    .select({
      id: activityLogs.id,
      actorType: activityLogs.actorType,
      action: activityLogs.action,
      targetType: activityLogs.targetType,
      targetId: activityLogs.targetId,
      roomId: activityLogs.roomId,
      summary: activityLogs.summary,
      metadata: activityLogs.metadata,
      createdAt: activityLogs.createdAt,
      userName: users.displayName,
      agentName: agents.displayName,
    })
    .from(activityLogs)
    .leftJoin(users, eq(users.id, activityLogs.actorUserId))
    .leftJoin(agents, eq(agents.id, activityLogs.actorAgentId))
    .where(and(...conds))
    .orderBy(desc(activityLogs.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    actor_type: r.actorType,
    actor_name: r.actorType === "agent" ? r.agentName : r.userName,
    action: r.action,
    target_type: r.targetType,
    target_id: r.targetId,
    room_id: r.roomId,
    summary: r.summary,
    metadata: (r.metadata ?? {}) as Record<string, unknown>,
    created_at: r.createdAt.toISOString(),
  }));
}
