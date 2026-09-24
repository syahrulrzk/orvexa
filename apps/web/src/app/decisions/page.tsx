import { desc, eq } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { DecisionList } from "@/components/decisions/decision-list";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { decisions } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";

export default async function DecisionsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Decisions">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const rows = await db
    .select({
      id: decisions.id,
      code: decisions.code,
      title: decisions.title,
      rationale: decisions.rationale,
      status: decisions.status,
      createdAt: decisions.createdAt,
      decidedAt: decisions.decidedAt,
    })
    .from(decisions)
    .where(eq(decisions.companyId, companyId))
    .orderBy(desc(decisions.createdAt))
    .limit(200);

  const canManage = hasPermission(ctx.company!.role, "approval.decide");
  const byStatus = (s: string) => rows.filter((d) => d.status === s).length;

  return (
    <AppShell
      title="Decisions"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Statistik</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Proposed</span>
                <span className="font-medium text-warning">{byStatus("proposed")}</span>
              </li>
              <li className="flex justify-between">
                <span>Approved</span>
                <span className="font-medium text-success">{byStatus("approved")}</span>
              </li>
              <li className="flex justify-between">
                <span>Rejected</span>
                <span className="font-medium text-danger">{byStatus("rejected")}</span>
              </li>
              <li className="flex justify-between">
                <span>Superseded</span>
                <span className="font-medium text-fg">{byStatus("superseded")}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Kode keputusan dibuat otomatis berurutan (DEC-0001, DEC-0002, ...). Keputusan juga bisa dicatat
              oleh agent lewat room.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Decision Record Log</h2>
            <p className="text-sm text-fg-muted">
              Keputusan organisasi dari manusia &amp; agent — dengan rationale yang bisa diaudit.
            </p>
          </div>
          {canManage ? <Badge variant="outline">Anda bisa memutuskan</Badge> : null}
        </div>

        <DecisionList decisions={rows} canManage={canManage} />
      </div>
    </AppShell>
  );
}
