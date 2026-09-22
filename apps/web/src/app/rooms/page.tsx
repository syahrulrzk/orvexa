import { and, asc, desc, eq, isNull } from "drizzle-orm";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { CreateRoomForm } from "@/components/rooms/create-room-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { agents, rooms } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export default async function RoomsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  const roomRows = companyId
    ? await db
        .select()
        .from(rooms)
        .where(and(eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
        .orderBy(desc(rooms.updatedAt))
        .limit(200)
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
    <AppShell title="Rooms">
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Collaboration Rooms</h2>
            <p className="text-xs text-muted-foreground">
              Ruang kolaborasi human + agent. {roomRows.length} room.
            </p>
          </div>
          <CreateRoomForm agents={agentOptions} />
        </div>

        {roomRows.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Belum ada room. Buat room pertama lewat tombol <strong>+ New Room</strong>.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {roomRows.map((room) => (
              <li key={room.id}>
                <Link href={`/rooms/${room.id}`} className="block">
                  <Card className="transition-colors hover:bg-accent/40">
                    <CardContent className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            #{room.name}
                          </span>
                          <Badge variant="outline">{room.type.replace("_", " ")}</Badge>
                          {room.isArchived ? <Badge variant="secondary">archived</Badge> : null}
                        </div>
                        {room.topic ? (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {room.topic}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatDateTime(room.updatedAt)}
                      </span>
                    </CardContent>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
