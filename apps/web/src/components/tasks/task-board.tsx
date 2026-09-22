"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigned_agent_id: string | null;
  room_id: string | null;
};

const COLUMNS: { key: string; label: string }[] = [
  { key: "backlog", label: "Backlog" },
  { key: "in_progress", label: "In Progress" },
  { key: "blocked", label: "Blocked" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const PRIORITY_COLOR: Record<string, string> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  critical: "destructive",
};

type AgentOption = { id: string; label: string };

export function TaskBoard({
  tasks,
  agents,
}: {
  tasks: TaskItem[];
  agents: AgentOption[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(form.get("title") ?? ""),
        description: String(form.get("description") ?? "") || null,
        priority: String(form.get("priority") ?? "medium"),
        assigned_agent_id: String(form.get("agent") ?? "") || null,
      }),
    });
    setPending(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat task.");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function moveTask(taskId: string, status: string) {
    setMovingId(taskId);
    await fetch(`/api/v1/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setMovingId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-xs text-muted-foreground">{tasks.length} task</p>
        {creating ? null : (
          <Button size="sm" onClick={() => setCreating(true)}>
            + New Task
          </Button>
        )}
      </div>

      {creating ? (
        <form
          onSubmit={createTask}
          className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-4"
        >
          <div className="space-y-1">
            <Label htmlFor="task-title">Judul</Label>
            <Input id="task-title" name="title" required placeholder="Perbaiki alert CPU tinggi" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="task-desc">Deskripsi (opsional)</Label>
            <Input id="task-desc" name="description" placeholder="Detail singkat..." />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="task-priority">Prioritas</Label>
              <select
                id="task-priority"
                name="priority"
                defaultValue="medium"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="task-agent">Assign ke agent</Label>
              <select
                id="task-agent"
                name="agent"
                defaultValue=""
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— tidak ada —</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Menyimpan..." : "Buat Task"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>
              Batal
            </Button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.key);
          return (
            <div key={col.key} className="min-w-0 rounded-lg border border-line bg-surface p-2">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-overline uppercase text-fg-faint">{col.label}</h3>
                <span className="text-xs text-fg-faint">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((task) => (
                  <Card key={task.id} className="bg-card">
                    <CardContent className="space-y-2 p-3">
                      <p className="text-sm font-medium text-foreground">{task.title}</p>
                      {task.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">
                          {task.description}
                        </p>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-1">
                        <Badge variant={(PRIORITY_COLOR[task.priority] ?? "outline") as never}>
                          {task.priority}
                        </Badge>
                        {task.assigned_agent_id ? (
                          <Badge variant="outline">
                            {agents.find((a) => a.id === task.assigned_agent_id)?.label ?? "agent"}
                          </Badge>
                        ) : null}
                      </div>
                      {col.key !== "done" ? (
                        <select
                          aria-label="Pindahkan ke status"
                          value={task.status}
                          disabled={movingId === task.id}
                          onChange={(e) => void moveTask(task.id, e.target.value)}
                          className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                          {COLUMNS.map((c) => (
                            <option key={c.key} value={c.key}>
                              → {c.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {task.room_id ? (
                        <Link
                          href={`/rooms/${task.room_id}`}
                          className="block text-xs text-muted-foreground hover:text-foreground"
                        >
                          Lihat room →
                        </Link>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 ? (
                  <p className="px-1 py-4 text-center text-xs text-fg-faint">kosong</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
