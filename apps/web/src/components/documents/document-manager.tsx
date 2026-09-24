"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDateTime } from "@/lib/time";

export type DocumentRow = {
  id: string;
  docType: string;
  title: string;
  status: string;
  version: number;
  updatedAt: Date;
};

export type DocumentDetail = {
  id: string;
  docType: string;
  title: string;
  contentMd: string | null;
  status: string;
  version: number;
  updatedAt: Date;
};

const DOC_TYPES = ["mop", "sop", "rca", "report", "runbook", "other"] as const;

const STATUS_VARIANT: Record<string, "warning" | "success" | "secondary"> = {
  draft: "warning",
  final: "success",
  archived: "secondary",
};

const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function DocumentManager({ documents, canWrite }: { documents: DocumentRow[]; canWrite: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title") ?? ""),
        doc_type: String(form.get("doc_type") ?? "other"),
        content_md: String(form.get("content_md") ?? ""),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat dokumen.");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function openDocument(docId: string) {
    if (openId === docId && detail) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(docId);
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/documents/${docId}`);
    setLoading(false);
    if (!res.ok) {
      setError("Gagal memuat dokumen.");
      return;
    }
    const body = (await res.json()) as { data: { document: DocumentDetail } };
    setDetail(body.data.document);
  }

  async function saveDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch(`/api/v1/documents/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(String(form.get("title") ?? "") !== detail.title ? { title: String(form.get("title")) } : {}),
        ...(String(form.get("content_md") ?? "") !== (detail.contentMd ?? "")
          ? { content_md: String(form.get("content_md")) }
          : {}),
        ...(String(form.get("status")) !== detail.status ? { status: String(form.get("status")) } : {}),
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menyimpan dokumen.");
      return;
    }
    setOpenId(null);
    setDetail(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-faint">
          {documents.length} dokumen · {documents.filter((d) => d.status === "final").length} final
        </p>
        {canWrite && creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Dokumen Baru
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {creating && (
        <form onSubmit={createDocument} className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">Dokumen baru</p>
          <div className="grid gap-4 md:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Judul</Label>
              <Input id="doc-title" name="title" required placeholder="MOP Penggantian Font UPS Room A" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-type">Tipe</Label>
              <select id="doc-type" name="doc_type" className={inputCls} defaultValue="mop">
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-content">Konten (Markdown)</Label>
            <textarea
              id="doc-content"
              name="content_md"
              rows={10}
              required
              className={`${inputCls} font-mono`}
              placeholder={"# Langkah 1\n1. ...\n2. ..."}
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Buat Dokumen"}
            </Button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {documents.map((doc) => (
          <Card key={doc.id} className={openId === doc.id ? "border-brand" : undefined}>
            <CardHeader className="pb-2">
              <button
                type="button"
                onClick={() => openDocument(doc.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <CardTitle className="min-w-0 truncate">
                  <span className="mr-1.5 rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-xs uppercase text-fg-muted">
                    {doc.docType}
                  </span>
                  {doc.title}
                </CardTitle>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant={STATUS_VARIANT[doc.status] ?? "secondary"}>{doc.status}</Badge>
                  <span className="font-mono text-xs text-fg-faint">v{doc.version}</span>
                </span>
              </button>
              <p className="text-xs text-fg-faint">Diupdate {formatDateTime(doc.updatedAt)}</p>
            </CardHeader>

            {openId === doc.id && loading && (
              <CardContent className="pt-0">
                <p className="text-sm text-fg-muted">Memuat...</p>
              </CardContent>
            )}

            {openId === doc.id && detail && !loading && (
              <CardContent className="pt-0">
                {canWrite ? (
                  <form onSubmit={saveDocument} className="space-y-4 border-t border-line pt-3">
                    <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                      <div className="space-y-1.5">
                        <Label htmlFor={`doc-title-${doc.id}`}>Judul</Label>
                        <Input id={`doc-title-${doc.id}`} name="title" defaultValue={detail.title} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`doc-status-${doc.id}`}>Status</Label>
                        <select id={`doc-status-${doc.id}`} name="status" className={inputCls} defaultValue={detail.status}>
                          {["draft", "final", "archived"].map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor={`doc-content-${doc.id}`}>
                        Konten — mengedit dokumen final otomatis menjadi v{detail.version + 1} (kembali draft)
                      </Label>
                      <textarea
                        id={`doc-content-${doc.id}`}
                        name="content_md"
                        rows={14}
                        defaultValue={detail.contentMd ?? ""}
                        className={`${inputCls} font-mono`}
                      />
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line pt-3">
                      <Button type="button" variant="ghost" onClick={() => { setOpenId(null); setDetail(null); }}>
                        Tutup
                      </Button>
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? "Menyimpan..." : "Simpan"}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-canvas p-3 font-mono text-xs text-fg-muted">
                    {detail.contentMd ?? "(kosong)"}
                  </pre>
                )}
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
