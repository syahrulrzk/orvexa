import { and, asc, eq, isNull } from "drizzle-orm";

import { ActivityFeed } from "@/components/activity/activity-feed";
import { AppShell } from "@/components/app-shell";
import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { listActivityFeed } from "@/lib/activity";
import { requireSessionContext } from "@/lib/session";

export default async function ActivityPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  const [items, roomRows] = companyId
    ? await Promise.all([
        listActivityFeed(companyId, { limit: 100 }),
        db
          .select({ id: rooms.id, name: rooms.name })
          .from(rooms)
          .where(and(eq(rooms.companyId, companyId), isNull(rooms.deletedAt)))
          .orderBy(asc(rooms.name))
          .limit(100),
      ])
    : [[], []];

  return (
    <AppShell title="Activity">
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Activity Center</h2>
          <p className="text-xs text-muted-foreground">
            Jejak aktivitas agent &amp; manusia: task, keputusan, dokumen, approval, dan run agent.
          </p>
        </div>
        <ActivityFeed initialItems={items} rooms={roomRows} />
      </div>
    </AppShell>
  );
}
