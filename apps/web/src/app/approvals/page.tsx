import { and, desc, eq, inArray } from "drizzle-orm";

import { ApprovalList } from "@/components/approvals/approval-list";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { expireStaleApprovals } from "@/lib/approvals";
import { db } from "@/lib/db";
import { agents, approvals } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";

export default async function ApprovalsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Approvals">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  // Kedaluwarsa diproses saat halaman dibuka (tanpa scheduler di MVP).
  await expireStaleApprovals(companyId);

  const rows = await db
    .select({
      id: approvals.id,
      title: approvals.title,
      action: approvals.action,
      payload: approvals.payload,
      riskLevel: approvals.riskLevel,
      status: approvals.status,
      agentName: agents.displayName,
      requestedAt: approvals.requestedAt,
      decidedAt: approvals.decidedAt,
      decisionNote: approvals.decisionNote,
      expiresAt: approvals.expiresAt,
    })
    .from(approvals)
    .leftJoin(agents, eq(agents.id, approvals.agentId))
    .where(and(eq(approvals.companyId, companyId), eq(approvals.status, "pending")))
    .orderBy(desc(approvals.requestedAt))
    .limit(100);

  const history = await db
    .select({
      id: approvals.id,
      title: approvals.title,
      action: approvals.action,
      payload: approvals.payload,
      riskLevel: approvals.riskLevel,
      status: approvals.status,
      agentName: agents.displayName,
      requestedAt: approvals.requestedAt,
      decidedAt: approvals.decidedAt,
      decisionNote: approvals.decisionNote,
      expiresAt: approvals.expiresAt,
    })
    .from(approvals)
    .leftJoin(agents, eq(agents.id, approvals.agentId))
    .where(
      and(
        eq(approvals.companyId, companyId),
        inArray(approvals.status, ["approved", "rejected", "expired"] as const),
      ),
    )
    .orderBy(desc(approvals.decidedAt))
    .limit(100);

  return (
    <AppShell
      title="Approvals"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Ringkasan</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              <li className="flex justify-between">
                <span>Pending</span>
                <span className="font-medium text-warning">{rows.length}</span>
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Approval muncul saat agent memanggil tool sensitif (permission matrix F5-01). Menyetujui
              akan mengeksekusi tool <b>sekali</b> dan melanjutkan kerja agent; menolak memberi tahu agent
              untuk mencari cara lain. Approval tanpa keputusan kedaluwarsa dalam 24 jam.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Control Gate</h2>
            <p className="text-sm text-fg-muted">
              Aksi sensitif dari agent yang menunggu persetujuan manusia.
            </p>
          </div>
          {hasPermission(ctx.company!.role, "approval.decide") ? (
            <Badge variant="outline">Anda bisa memutuskan</Badge>
          ) : null}
        </div>

        <ApprovalList approvals={[...rows, ...history]} />
      </div>
    </AppShell>
  );
}
