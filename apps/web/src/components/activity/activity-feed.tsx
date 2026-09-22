"use client";

import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/time";

export type ActivityItem = {
  id: string;
  actor_type: string;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  room_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

const ACTION_ICON: Record<string, string> = {
  "task.created": "📋",
  "task.updated": "📋",
  "task.deleted": "🗑️",
  "decision.created": "⚖️",
  "document.created": "📄",
  "document.updated": "📄",
  "approval.requested": "🔔",
  "approval.resolved": "✅",
  "agent.run.started": "🤖",
  "agent.run.finished": "🤖",
  "knowledge.indexed": "📚",
};

const ACTOR_COLOR: Record<string, string> = {
  human: "bg-info/20 text-info",
  agent: "bg-brand text-brand-fg",
  system: "bg-secondary text-secondary-foreground",
};

export function ActivityFeed({
  initialItems,
  rooms,
}: {
  initialItems: ActivityItem[];
  rooms: { id: string; name: string }[];
}) {
  const [items, setItems] = useState<ActivityItem[]>(initialItems);
  const [filter, setFilter] = useState<string>("all");

  // SSE: feed mengikuti event `activity.logged` dari room yang user buka
  // lewat EventSource per-room tidak praktis di sini; cukup refetch tiap
  // 15 detik + refresh saat window fokus. Realtime penuh per-room tetap
  // lewat SSE `activity.logged` di room-view.
  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch("/api/v1/activity?limit=100", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as { data?: { activity?: ActivityItem[] } };
        if (!cancelled && body.data?.activity) setItems(body.data.activity);
      } catch {
        // diam — polling berikutnya akan coba lagi
      }
    }

    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const filtered =
    filter === "all" ? items : items.filter((i) => i.action.startsWith(filter));

  const groups = [
    { key: "all", label: "Semua" },
    { key: "task", label: "Tasks" },
    { key: "agent", label: "Agent" },
    { key: "document", label: "Dokumen" },
    { key: "decision", label: "Keputusan" },
    { key: "approval", label: "Approval" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            onClick={() => setFilter(g.key)}
            className={cn(
              "rounded-md border px-2 py-0.5 text-xs",
              filter === g.key
                ? "border-info bg-info/10 text-info"
                : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            {g.label}
          </button>
        ))}
      </div>

      <ol className="relative space-y-3 border-l border-border pl-4">
        {filtered.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">Belum ada aktivitas.</p>
        ) : (
          filtered.map((item) => (
            <li key={item.id} className="relative">
              <span
                className={cn(
                  "absolute -left-[21px] grid h-4 w-4 place-items-center rounded-full text-[9px]",
                  ACTOR_COLOR[item.actor_type] ?? "bg-secondary",
                )}
                aria-hidden
              >
                {ACTION_ICON[item.action] ?? "•"}
              </span>
              <div className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {item.actor_name ?? item.actor_type}
                  </span>
                  <Badge variant="outline">{item.actor_type}</Badge>
                  <span className="font-mono text-[11px]">{item.action}</span>
                  <span>{formatDateTime(item.created_at)}</span>
                </div>
                {item.summary ? (
                  <p className="mt-1 text-sm text-foreground">{item.summary}</p>
                ) : null}
                {item.room_id ? (
                  <a
                    href={`/rooms/${item.room_id}`}
                    className="mt-1 inline-block text-xs text-muted-foreground hover:text-foreground"
                  >
                    {rooms.find((r) => r.id === item.room_id)?.name ?? "room"} →
                  </a>
                ) : null}
              </div>
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
