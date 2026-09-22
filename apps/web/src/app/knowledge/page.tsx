import { and, desc, eq, isNull } from "drizzle-orm";

import { AppShell } from "@/components/app-shell";
import { KnowledgeUploader } from "@/components/knowledge/knowledge-uploader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { knowledgeBases, knowledgeDocuments } from "@/lib/db/schema";
import { requireSessionContext } from "@/lib/session";
import { formatDateTime } from "@/lib/time";

export default async function KnowledgePage() {
  const ctx = await requireSessionContext();
  const companyId = ctx.company?.id;

  const [bases, docs] = companyId
    ? await Promise.all([
        db
          .select()
          .from(knowledgeBases)
          .where(and(eq(knowledgeBases.companyId, companyId), isNull(knowledgeBases.deletedAt)))
          .orderBy(desc(knowledgeBases.createdAt)),
        db
          .select({
            id: knowledgeDocuments.id,
            kbId: knowledgeDocuments.knowledgeBaseId,
            title: knowledgeDocuments.title,
            sourceType: knowledgeDocuments.sourceType,
            status: knowledgeDocuments.status,
            tokenCount: knowledgeDocuments.tokenCount,
            createdAt: knowledgeDocuments.createdAt,
          })
          .from(knowledgeDocuments)
          .where(
            and(eq(knowledgeDocuments.companyId, companyId), isNull(knowledgeDocuments.deletedAt)),
          )
          .orderBy(desc(knowledgeDocuments.createdAt))
          .limit(100),
      ])
    : [[], []];

  const baseOptions = bases.map((b) => ({ id: b.id, name: b.name }));
  const kbName = (id: string) => baseOptions.find((b) => b.id === id)?.name ?? "KB";

  const STATUS_COLOR: Record<string, string> = {
    ready: "default",
    indexing: "secondary",
    pending: "outline",
    failed: "destructive",
  } as const;

  return (
    <AppShell title="Knowledge">
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Knowledge Base</h2>
            <p className="text-xs text-muted-foreground">
              Dokumen internal yang di-chunk &amp; di-embed (pgvector). Agent bisa mencarinya lewat
              tool <code>kb.search</code>.
            </p>
          </div>
          <KnowledgeUploader bases={baseOptions} />
        </div>

        {bases.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Belum ada knowledge base. Buat lewat API <code>POST /api/v1/knowledge</code> (contoh
              body: <code>{'{"name": "Infrastructure"}'}</code>), lalu upload dokumen di sini.
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-1">
            {docs.map((d) => (
              <li key={d.id}>
                <Card>
                  <CardContent className="flex items-center justify-between gap-4 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {kbName(d.kbId)} · .{d.sourceType} ·{" "}
                        {d.tokenCount ? `${d.tokenCount} token` : "belum diindex"} ·{" "}
                        {formatDateTime(d.createdAt)}
                      </p>
                    </div>
                    <Badge variant={(STATUS_COLOR[d.status] ?? "outline") as never}>
                      {d.status}
                    </Badge>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
