"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/time";

export type DecisionRow = {
  id: string;
  code: string | null;
  title: string;
  rationale: string | null;
  status: string;
  createdAt: Date;
  decidedAt: Date | null;
};

const STATUS_VARIANT: Record<string, "warning" | "success" | "danger" | "secondary"> = {
  proposed: "warning",
  approved: "success",
  rejected: "danger",
  superseded: "secondary",
};

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DecisionList({ decisions, canManage }: { decisions: DecisionRow[]; canManage: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDecision(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title") ?? ""),
        rationale: String(form.get("rationale") ?? "") || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal mencatat keputusan.");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function decide(decisionId: string, status: "approved" | "rejected") {
    const note = status === "rejected" ? (prompt("Alasan penolakan (opsional):") ?? undefined) : undefined;
    const res = await fetch(`/api/v1/decisions/${decisionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(note ? { rationale: note } : {}) }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal memutuskan.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-faint">
          {decisions.length} keputusan · {decisions.filter((d) => d.status === "proposed").length} menunggu
        </p>
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Catat Keputusan
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {creating && (
        <form onSubmit={createDecision} className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">Keputusan baru</p>
          <div className="space-y-1.5">
            <Label htmlFor="dec-title">Judul</Label>
            <Input id="dec-title" name="title" required placeholder="Migrasi core switch ke VLAN baru" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dec-rationale">Rationale</Label>
            <textarea
              id="dec-rationale"
              name="rationale"
              rows={3}
              className={inputCls}
              placeholder="Konteks, alternatif yang dipertimbangkan, dan alasan keputusan..."
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Catat"}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {decisions.map((decision) => (
          <Card key={decision.id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="min-w-0">
                  <span className="font-mono text-xs text-brand">{decision.code ?? "DEC"}</span>{" "}
                  <span className="truncate">{decision.title}</span>
                </CardTitle>
                <Badge variant={STATUS_VARIANT[decision.status] ?? "secondary"}>{decision.status}</Badge>
              </div>
              <p className="text-xs text-fg-faint">
                Dicatat {formatDateTime(decision.createdAt)}
                {decision.decidedAt ? ` · diputuskan ${formatDateTime(decision.decidedAt)}` : ""}
              </p>
            </CardHeader>
            {decision.rationale && (
              <CardContent className="pt-0">
                <p className="whitespace-pre-wrap text-sm text-fg-muted">{decision.rationale}</p>
              </CardContent>
            )}
            {canManage && decision.status === "proposed" && (
              <CardContent className="flex gap-2 pt-0">
                <Button size="sm" variant="outline" className="text-success" onClick={() => decide(decision.id, "approved")}>
                  Approve
                </Button>
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => decide(decision.id, "rejected")}>
                  Reject
                </Button>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
