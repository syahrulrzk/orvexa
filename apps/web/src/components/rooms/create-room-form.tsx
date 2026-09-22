"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AgentOption = { id: string; label: string };

const ROOM_TYPES = [
  { value: "general", label: "General" },
  { value: "department", label: "Department" },
  { value: "incident", label: "Incident" },
  { value: "project", label: "Project" },
  { value: "war_room", label: "War Room" },
];

export function CreateRoomForm({ agents }: { agents: AgentOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const res = await fetch("/api/v1/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(form.get("name") ?? ""),
        type: String(form.get("type") ?? "general"),
        topic: String(form.get("topic") ?? "") || null,
        member_agent_ids: form.getAll("agents").map(String),
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? "Gagal membuat room.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        + New Room
      </Button>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="w-full max-w-md space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="space-y-1">
        <Label htmlFor="room-name">Nama room</Label>
        <Input id="room-name" name="name" required placeholder="incident-server-001" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="room-type">Tipe</Label>
          <select
            id="room-type"
            name="type"
            defaultValue="general"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {ROOM_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="room-topic">Topik (opsional)</Label>
          <Input id="room-topic" name="topic" placeholder="Investigasi HTTP 500" />
        </div>
      </div>

      {agents.length > 0 ? (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-muted-foreground">Tambah agent</legend>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-border p-2">
            {agents.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="agents" value={a.id} />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Menyimpan..." : "Buat Room"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}
