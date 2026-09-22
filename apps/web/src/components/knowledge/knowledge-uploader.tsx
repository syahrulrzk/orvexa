"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type KbOption = { id: string; name: string };

export function KnowledgeUploader({ bases }: { bases: KbOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newKb, setNewKb] = useState("");

  /** Buat KB baru lalu langsung tampil di dropdown. */
  async function createKb() {
    const name = newKb.trim();
    if (!name) return;
    setError(null);
    const res = await fetch("/api/v1/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat KB.");
      return;
    }
    setNewKb("");
    router.refresh();
  }

  /** Upload dokumen teks → index (chunk → embed → simpan). */
  async function upload(form: HTMLFormElement) {
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih file .md/.txt/.csv/.json terlebih dulu.");
      return;
    }
    setPending(true);
    setError(null);
    setNotice(null);

    const kbId = String(data.get("kb_id") ?? "");
    data.set("title", String(data.get("title") ?? ""));

    const res = await fetch(`/api/v1/knowledge/${kbId}/documents`, {
      method: "POST",
      body: data,
    });
    setPending(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal mengindex dokumen.");
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      data?: { chunks?: number; tokens?: number };
    } | null;
    setNotice(
      `Tersimpan & terindex: ${body?.data?.chunks ?? 0} chunk (${body?.data?.tokens ?? 0} token).`,
    );
    form.reset();
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + Upload Dokumen
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void upload(e.currentTarget);
      }}
      className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-4"
    >
      {bases.length > 0 ? (
        <div className="space-y-1">
          <Label htmlFor="kb-select">Knowledge base</Label>
          <select
            id="kb-select"
            name="kb_id"
            defaultValue={bases[0]?.id ?? ""}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {bases.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {bases.length === 0 || newKb !== "" || true ? (
        <div className="space-y-1">
          <Label htmlFor="kb-new">Atau buat KB baru</Label>
          <div className="flex gap-2">
            <Input
              id="kb-new"
              value={newKb}
              onChange={(e) => setNewKb(e.target.value)}
              placeholder="Infrastructure"
            />
            <Button type="button" size="sm" variant="outline" onClick={() => void createKb()}>
              Buat
            </Button>
          </div>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="kb-title">Judul (opsional)</Label>
        <Input id="kb-title" name="title" placeholder="Runbook restart nginx" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="kb-file">File (.md, .txt, .csv, .json — maks 5 MB)</Label>
        <Input id="kb-file" name="file" type="file" accept=".md,.markdown,.txt,.csv,.json" />
      </div>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-success">{notice}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Mengindex..." : "Upload & Index"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Tutup
        </Button>
      </div>
    </form>
  );
}
