import { and, desc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { DocumentManager } from "@/components/documents/document-manager";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import { hasPermission } from "@/lib/rbac";
import { requireSessionContext } from "@/lib/session";

const DOC_TYPES = ["mop", "sop", "rca", "report", "runbook", "other"];

export default async function DocumentsPage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  if (!companyId) {
    return (
      <AppShell title="Documents">
        <p className="p-6 text-sm text-muted-foreground">Belum tergabung di company mana pun.</p>
      </AppShell>
    );
  }

  const rows = await db
    .select({
      id: documents.id,
      docType: documents.docType,
      title: documents.title,
      status: documents.status,
      version: documents.version,
      updatedAt: documents.updatedAt,
    })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.updatedAt))
    .limit(200);

  const canWrite = hasPermission(ctx.company!.role, "document.create");

  return (
    <AppShell
      title="Documents"
      context={
        <div className="space-y-5 p-4">
          <div>
            <h2 className="text-overline uppercase text-fg-faint">Per tipe</h2>
            <ul className="mt-3 space-y-1.5 text-sm text-fg-muted">
              {DOC_TYPES.map((t) => {
                const n = rows.filter((d) => d.docType === t).length;
                return (
                  <li key={t} className="flex justify-between">
                    <span className="font-mono uppercase">{t}</span>
                    <span className="font-medium text-fg">{n}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-md border border-line bg-canvas p-3">
            <p className="text-xs text-fg-muted">
              Agent juga menghasilkan dokumen lewat tool <span className="font-mono">doc.generate</span> — hasilnya
              muncul di sini dengan penanda sumber.
            </p>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg">Document Center</h2>
            <p className="text-sm text-fg-muted">
              MOP, SOP, RCA, report, dan runbook — dari manusia maupun agent, dengan versioning otomatis.
            </p>
          </div>
          <Badge variant="outline">{rows.length} dokumen</Badge>
        </div>

        <DocumentManager documents={rows} canWrite={canWrite} />
      </div>
    </AppShell>
  );
}
