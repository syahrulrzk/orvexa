import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { RoomView } from "@/components/rooms/room-view";
import type { AgentOption, RoomMessage } from "@/components/rooms/types";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { agents, messages, roomMembers, rooms, users } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-success",
  thinking: "bg-info",
  working: "bg-warning",
  waiting_approval: "bg-warning",
  error: "bg-danger",
  disabled: "bg-neutral",
};

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;
  if (!companyId) notFound();

  const { id } = await params;

  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) notFound();

  const memberRows = await db
    .select({
      id: roomMembers.id,
      role: roomMembers.role,
      userName: users.displayName,
      agentId: roomMembers.agentId,
      agentName: agents.displayName,
      agentRole: agents.role,
      agentStatus: agents.status,
    })
    .from(roomMembers)
    .leftJoin(users, eq(users.id, roomMembers.userId))
    .leftJoin(agents, eq(agents.id, roomMembers.agentId))
    .where(eq(roomMembers.roomId, id));

  const rawMessages = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      threadRootId: messages.threadRootId,
      authorType: messages.authorType,
      authorUserId: messages.authorUserId,
      authorAgentId: messages.authorAgentId,
      kind: messages.kind,
      content: messages.content,
      mentions: messages.mentions,
      createdAt: messages.createdAt,
      userName: users.displayName,
      agentName: agents.displayName,
      agentRole: agents.role,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.authorUserId))
    .leftJoin(agents, eq(agents.id, messages.authorAgentId))
    .where(and(eq(messages.roomId, id), eq(messages.isDeleted, false)))
    .orderBy(desc(messages.createdAt))
    .limit(50);

  const initialMessages: RoomMessage[] = rawMessages.reverse().map((m) => ({
    id: m.id,
    roomId: m.roomId,
    threadRootId: m.threadRootId,
    authorType: m.authorType,
    authorUserId: m.authorUserId,
    authorAgentId: m.authorAgentId,
    kind: m.kind,
    content: m.content,
    mentions: m.mentions,
    createdAt: m.createdAt.toISOString(),
    authorName: m.agentName ?? m.userName ?? null,
    authorRole: m.agentRole ?? null,
  }));

  const agentRows = await db
    .select({ id: agents.id, name: agents.name, displayName: agents.displayName, status: agents.status })
    .from(agents)
    .where(and(eq(agents.companyId, companyId), isNull(agents.deletedAt)))
    .orderBy(asc(agents.name));

  const agentOptions: AgentOption[] = agentRows.map((a) => ({
    id: a.id,
    label: a.displayName ?? a.name,
    status: a.status,
  }));

  return (
    <AppShell
      title={`#${room.name}`}
      context={
        <div className="p-4">
          <h2 className="text-overline uppercase text-fg-faint">Members ({memberRows.length})</h2>
          <ul className="mt-3 space-y-2">
            {memberRows.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md border border-border bg-canvas px-3 py-2"
              >
                {m.agentId ? (
                  <span
                    className={`h-2 w-2 rounded-full ${STATUS_COLOR[m.agentStatus ?? "idle"] ?? "bg-neutral"}`}
                    aria-hidden
                  />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-info" aria-hidden />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm text-foreground">
                    {m.agentName ?? m.userName ?? "unknown"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.agentRole ?? m.role}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-6 py-3">
          <Badge variant="outline">{room.type.replace("_", " ")}</Badge>
          {room.topic ? <span className="text-xs text-muted-foreground">{room.topic}</span> : null}
        </div>
        <RoomView
          roomId={room.id}
          initialMessages={initialMessages}
          agents={agentOptions}
          currentUserId={ctx.user.id}
        />
      </div>
    </AppShell>
  );
}
