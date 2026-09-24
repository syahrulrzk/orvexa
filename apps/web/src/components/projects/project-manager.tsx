"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/time";

export type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  startDate: string | null;
  targetDate: string | null;
  taskCount: number;
  taskDone: number;
};

const STATUSES = ["planning", "active", "on_hold", "completed", "archived"] as const;

const STATUS_VARIANT: Record<string, "info" | "success" | "warning" | "secondary" | "danger"> = {
  planning: "info",
  active: "success",
  on_hold: "warning",
  completed: "secondary",
  archived: "secondary",
};

const inputCls =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ProjectManager({ projects, canManage }: { projects: ProjectRow[]; canManage: boolean }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || null,
        status: String(form.get("status") ?? "active"),
        start_date: String(form.get("start_date") ?? "") || null,
        target_date: String(form.get("target_date") ?? "") || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat project.");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function saveProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const res = await fetch(`/api/v1/projects/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? "") || undefined,
        description: String(form.get("description") ?? "") || null,
        status: String(form.get("status") ?? "active"),
        start_date: String(form.get("start_date") ?? "") || null,
        target_date: String(form.get("target_date") ?? "") || null,
      }),
    });
    setPending(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menyimpan project.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  async function deleteProject(projectId: string) {
    if (!confirm("Hapus project ini? Task tidak ikut terhapus.")) return;
    const res = await fetch(`/api/v1/projects/${projectId}`, { method: "DELETE" });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal menghapus project.");
      return;
    }
    setEditingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-fg-faint">
          {projects.length} project · {projects.filter((p) => p.status === "active").length} aktif
        </p>
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + Project Baru
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {creating && (
        <form onSubmit={createProject} className="space-y-4 rounded-lg border border-line bg-surface-raised p-5">
          <p className="text-overline uppercase text-fg-faint">Project baru</p>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="prj-name">Nama</Label>
              <Input id="prj-name" name="name" required placeholder="Migrasi Jaringan Cabang 2026" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prj-desc">Deskripsi</Label>
              <Input id="prj-desc" name="description" placeholder="Tujuan & ruang lingkup..." />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prj-start">Mulai</Label>
              <Input id="prj-start" name="start_date" type="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prj-target">Target selesai</Label>
              <Input id="prj-target" name="target_date" type="date" />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Buat Project"}
            </Button>
          </div>
        </form>
      )}

      <div className="grid gap-3 xl:grid-cols-2">
        {projects.map((project) => {
          const pct = project.taskCount > 0 ? Math.round((project.taskDone / project.taskCount) * 100) : 0;
          return (
            <Card key={project.id} className={editingId === project.id ? "border-brand" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="truncate">{project.name}</CardTitle>
                  <Badge variant={STATUS_VARIANT[project.status] ?? "secondary"}>{project.status}</Badge>
                </div>
                {project.description && (
                  <p className="line-clamp-2 text-xs text-fg-muted">{project.description}</p>
                )}
              </CardHeader>
              <CardContent>
                <div className="mb-1.5 flex items-center justify-between text-xs text-fg-muted">
                  <span>
                    {project.taskDone}/{project.taskCount} task selesai
                  </span>
                  <span className="font-mono">
                    {project.startDate ? formatDate(project.startDate) : "—"} →{" "}
                    {project.targetDate ? formatDate(project.targetDate) : "—"}
                  </span>
                </div>
                <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas-subtle">
                  <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/tasks?project_id=${project.id}`}>
                    <Button size="sm" variant="outline">
                      Lihat Task
                    </Button>
                  </Link>
                  {canManage && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(editingId === project.id ? null : project.id)}>
                        {editingId === project.id ? "Tutup" : "Edit"}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-danger" onClick={() => deleteProject(project.id)}>
                        Hapus
                      </Button>
                    </>
                  )}
                </div>

                {editingId === project.id && (
                  <form onSubmit={saveProject} className="mt-3 space-y-4 border-t border-line pt-3">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor={`prj-name-${project.id}`}>Nama</Label>
                        <Input id={`prj-name-${project.id}`} name="name" defaultValue={project.name} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`prj-desc-${project.id}`}>Deskripsi</Label>
                        <Input id={`prj-desc-${project.id}`} name="description" defaultValue={project.description ?? ""} />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`prj-status-${project.id}`}>Status</Label>
                        <select id={`prj-status-${project.id}`} name="status" className={inputCls} defaultValue={project.status}>
                          {STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`prj-start-${project.id}`}>Mulai</Label>
                        <Input
                          id={`prj-start-${project.id}`}
                          name="start_date"
                          type="date"
                          defaultValue={project.startDate ?? ""}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`prj-target-${project.id}`}>Target selesai</Label>
                        <Input
                          id={`prj-target-${project.id}`}
                          name="target_date"
                          type="date"
                          defaultValue={project.targetDate ?? ""}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 border-t border-line pt-3">
                      <Button type="button" variant="ghost" onClick={() => setEditingId(null)}>
                        Batal
                      </Button>
                      <Button type="submit" size="sm" disabled={pending}>
                        {pending ? "Menyimpan..." : "Simpan"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
