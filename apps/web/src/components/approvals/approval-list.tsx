"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/time";

export type ApprovalRow = {
  id: string;
  title: string;
  action: string;
  payload: unknown;
  riskLevel: string;
  status: string;
  agentName: string | null;
  requestedAt: Date;
  decidedAt: Date | null;
  decisionNote: string | null;
  expiresAt: Date | null;
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "danger" | "secondary"> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  expired: "secondary",
};

const RISK_VARIANT: Record<string, "danger" | "warning" | "info"> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

export function ApprovalList({ approvals }: { approvals: ApprovalRow[] }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  async function decide(approvalId: string, decision: "approved" | "rejected") {
    setPendingId(approvalId);
    setError(null);
    const res = await fetch(`/api/v1/approvals/${approvalId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: noteFor === approvalId ? note || null : null }),
    });
    setPendingId(null);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal memproses keputusan.");
      return;
    }
    setNoteFor(null);
    setNote("");
    router.refresh();
  }

  const pending = approvals.filter((a) => a.status === "pending");
  const history = approvals.filter((a) => a.status !== "pending");

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <section className="space-y-3">
        <p className="text-overline uppercase text-fg-faint">Menunggu keputusan ({pending.length})</p>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-fg-muted">
              Tidak ada approval yang menunggu. Agent akan meminta persetujuan di sini saat butuh
              menjalankan aksi sensitif.
            </CardContent>
          </Card>
        ) : (
          pending.map((approval) => {
            const payload = (approval.payload ?? {}) as { args?: Record<string, unknown> };
            const args = payload.args ?? {};
            return (
              <Card key={approval.id} className="border-warning/50">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0">{approval.title}</CardTitle>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={RISK_VARIANT[approval.riskLevel] ?? "warning"}>risk: {approval.riskLevel}</Badge>
                      <Badge variant="warning">pending</Badge>
                    </div>
                  </div>
                  <p className="text-xs text-fg-muted">
                    {approval.agentName ?? "Agent"} · diminta {formatDateTime(approval.requestedAt)}
                    {approval.expiresAt ? ` · kedaluwarsa ${formatDateTime(approval.expiresAt)}` : ""}
                  </p>
                </CardHeader>
                <CardContent className="pt-0">
                  {Object.keys(args).length > 0 && (
                    <pre className="mb-3 max-h-40 overflow-auto rounded-md border border-line bg-canvas p-3 font-mono text-xs text-fg-muted">
                      {JSON.stringify(args, null, 2)}
                    </pre>
                  )}
                  {noteFor === approval.id ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Catatan keputusan (opsional)..."
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => decide(approval.id, "approved")} disabled={pendingId === approval.id}>
                          {pendingId === approval.id ? "Memproses..." : "Setujui & Eksekusi"}
                        </Button>
                        <Button size="sm" variant="outline" className="text-danger" onClick={() => decide(approval.id, "rejected")} disabled={pendingId === approval.id}>
                          Tolak
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setNoteFor(null); setNote(""); }}>
                          Batal
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => setNoteFor(approval.id)}>
                        Tinjau...
                      </Button>
                      <Button size="sm" variant="outline" className="text-danger" onClick={() => decide(approval.id, "rejected")} disabled={pendingId === approval.id}>
                        Tolak
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-3">
          <p className="text-overline uppercase text-fg-faint">Riwayat ({history.length})</p>
          {history.map((approval) => (
            <Card key={approval.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="min-w-0 truncate">{approval.title}</CardTitle>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={STATUS_VARIANT[approval.status] ?? "secondary"}>{approval.status}</Badge>
                  </div>
                </div>
                <p className="text-xs text-fg-faint">
                  {approval.agentName ?? "Agent"} · {formatDateTime(approval.requestedAt)}
                  {approval.decidedAt ? ` · diputuskan ${formatDateTime(approval.decidedAt)}` : ""}
                </p>
                {approval.decisionNote && (
                  <p className="text-xs text-fg-muted">Catatan: {approval.decisionNote}</p>
                )}
              </CardHeader>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}
