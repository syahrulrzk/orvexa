"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { OfficeSnapshot, OfficeAgent } from "@/lib/office";

/**
 * Virtual Office (Phase 10) — denah isometric CSS murni (tanpa canvas/3D
 * library) supaya ringan dan konsisten dengan design token Orvexa.
 *
 * Fitur: pilih departemen (lantai), workstation per agent dengan status
 * lampu realtime, panel detail agent (task/room/aksi), dan feed aktivitas
 * live via SSE `orvexa.office`.
 */

const STATUS_META: Record<string, { label: string; dot: string; ring: string }> = {
  idle: { label: "Idle", dot: "bg-emerald-500", ring: "ring-emerald-500/30" },
  thinking: { label: "Thinking", dot: "bg-blue-500", ring: "ring-blue-500/30" },
  working: { label: "Working", dot: "bg-amber-500", ring: "ring-amber-500/30" },
  waiting_approval: { label: "Waiting Approval", dot: "bg-orange-500", ring: "ring-orange-500/30" },
  error: { label: "Error", dot: "bg-red-500", ring: "ring-red-500/30" },
  disabled: { label: "Disabled", dot: "bg-neutral-500", ring: "ring-neutral-500/30" },
};

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, dot: "bg-neutral-500", ring: "ring-neutral-500/30" };
}

type OfficeEvent = {
  type: string;
  agent_id?: string;
  status?: string;
  action?: string;
  summary?: string | null;
  actor_type?: string;
  ts?: string;
};

export function OfficeView({ initial }: { initial: OfficeSnapshot }) {
  const [snapshot, setSnapshot] = useState<OfficeSnapshot>(initial);
  const [activeDept, setActiveDept] = useState<string>(initial.departments[0]?.key ?? "infrastructure");
  const [selected, setSelected] = useState<OfficeAgent | null>(null);
  const [liveEvents, setLiveEvents] = useState<OfficeEvent[]>([]);
  const sourceRef = useRef<EventSource | null>(null);

  const department = useMemo(
    () => snapshot.departments.find((d) => d.key === activeDept) ?? snapshot.departments[0],
    [snapshot, activeDept],
  );

  // --- SSE realtime: update status + feed tanpa reload ---
  useEffect(() => {
    const source = new EventSource("/api/v1/office/events");
    sourceRef.current = source;

    const handle = (raw: MessageEvent) => {
      try {
        const event = JSON.parse(raw.data) as OfficeEvent;
        setLiveEvents((prev) => [event, ...prev].slice(0, 30));

        if (event.type === "agent.status" && event.agent_id) {
          setSnapshot((prev) => ({
            ...prev,
            departments: prev.departments.map((d) => ({
              ...d,
              agents: d.agents.map((a) =>
                a.id === event.agent_id
                  ? {
                      ...a,
                      status: event.status ?? a.status,
                      last_activity: event.ts ?? a.last_activity,
                    }
                  : a,
              ),
            })),
          }));
          setSelected((prev) =>
            prev && prev.id === event.agent_id ? { ...prev, status: event.status ?? prev.status } : prev,
          );
        }
      } catch {
        // payload rusak — abaikan
      }
    };

    source.addEventListener("agent.status", handle);
    source.addEventListener("activity.logged", handle);

    return () => {
      source.close();
      sourceRef.current = null;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const resp = await fetch("/api/v1/office", { cache: "no-store" });
      if (!resp.ok) return;
      const body = (await resp.json()) as { data: OfficeSnapshot };
      setSnapshot(body.data);
    } catch {
      // biarkan snapshot lama
    }
  }, []);

  const agents = department?.agents ?? [];
  const summary = snapshot.summary;

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard label="Total Agent" value={summary.total_agents} />
        {Object.entries(summary.by_status).slice(0, 4).map(([status, n]) => (
          <StatCard
            key={status}
            label={statusMeta(status).label}
            value={n}
            dot={statusMeta(status).dot}
          />
        ))}
      </div>

      {/* Switcher lantai (departemen) */}
      <div className="flex flex-wrap gap-2">
        {snapshot.departments.map((d) => {
          const active = d.key === activeDept;
          const busy = d.agents.filter((a) => a.status !== "idle" && a.status !== "disabled").length;
          return (
            <button
              key={d.key}
              onClick={() => setActiveDept(d.key)}
              className={`rounded-md border px-3 py-1.5 text-sm transition ${
                active
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-surface text-fg hover:border-brand/50"
              }`}
            >
              {d.name}
              <span className="ml-2 text-xs opacity-70">
                {d.agents.length} agent{busy > 0 ? ` · ${busy} aktif` : ""}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        {/* Denah isometric */}
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <div>
              <h2 className="text-sm font-semibold">{department?.name}</h2>
              <p className="text-xs text-fg-faint">{department?.description}</p>
            </div>
            <button onClick={refresh} className="text-xs text-fg-faint hover:text-fg">
              refresh
            </button>
          </div>

          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
          >
            {agents.map((agent, index) => {
              const meta = statusMeta(agent.status);
              const isSelected = selected?.id === agent.id;
              return (
                <button
                  key={agent.id}
                  onClick={() => setSelected(agent)}
                  className={`
                    group relative rounded-lg border p-3 text-left transition
                    ${isSelected ? "border-brand ring-2 " + meta.ring : "border-line"}
                    hover:border-brand/60
                  `}
                  style={{ transform: `translateY(${(index % 2) * 8}px)` }} // efek stagger isometric
                >
                  {/* Workstation */}
                  <div className="mb-2 flex items-center justify-between">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot} ${agent.status !== "idle" ? "animate-pulse" : ""}`} />
                    <span className="text-[10px] uppercase tracking-wide text-fg-faint">
                      WS-{String(index + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <p className="truncate text-sm font-medium">{agent.display_name}</p>
                  <p className="truncate text-xs text-fg-faint">{agent.role ?? agent.department}</p>
                  <p className="mt-2 truncate text-[11px] text-fg-faint">
                    {meta.label}
                    {agent.current_task ? ` · ${agent.current_task.title}` : ""}
                  </p>
                </button>
              );
            })}
            {agents.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-fg-faint">
                Belum ada agent di departemen ini.
              </p>
            )}
          </div>
        </div>

        {/* Panel kanan: detail + feed */}
        <div className="space-y-4">
          {selected ? (
            <AgentPanel
              agent={selected}
              onClose={() => setSelected(null)}
            />
          ) : (
            <div className="rounded-lg border border-line bg-surface p-4 text-sm text-fg-faint">
              Klik salah satu workstation untuk melihat detail agent.
            </div>
          )}

          {/* Feed aktivitas live */}
          <div className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Aktivitas Live</h3>
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-fg-faint">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                SSE
              </span>
            </div>
            <ul className="max-h-64 space-y-1.5 overflow-y-auto text-xs">
              {liveEvents.filter((e) => e.type === "activity.logged").slice(0, 12).map((e, i) => (
                <li key={`${e.ts}-${i}`} className="truncate">
                  <span className="text-fg-faint">{e.ts?.slice(11, 19)}</span>{" "}
                  {e.summary ?? e.action}
                </li>
              ))}
              {liveEvents.filter((e) => e.type === "activity.logged").length === 0 &&
                snapshot.recent_activity.slice(0, 8).map((a) => (
                  <li key={a.id} className="truncate text-fg-faint">
                    <span className="text-fg-faint">{a.created_at.slice(11, 19)}</span> {a.summary ?? a.action}
                  </li>
                ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, dot }: { label: string; value: number; dot?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <p className="flex items-center gap-1.5 text-xs text-fg-faint">
        {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function AgentPanel({ agent, onClose }: { agent: OfficeAgent; onClose: () => void }) {
  const meta = statusMeta(agent.status);
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${meta.dot}`} />
          <div>
            <h3 className="text-sm font-semibold">{agent.display_name}</h3>
            <p className="text-xs text-fg-faint">{agent.role ?? agent.department}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-xs text-fg-faint hover:text-fg" aria-label="tutup">
          ✕
        </button>
      </div>

      <dl className="space-y-2 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-fg-faint">Status</dt>
          <dd>{meta.label}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-faint">Task saat ini</dt>
          <dd className="max-w-[180px] truncate text-right">
            {agent.current_task ? agent.current_task.title : "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-fg-faint">Room</dt>
          <dd className="max-w-[180px] truncate text-right">
            {agent.current_room ? `#${agent.current_room.name}` : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-2">
        {agent.current_room && (
          <a
            href={`/rooms/${agent.current_room.id}`}
            className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-brand/60"
          >
            Enter Room
          </a>
        )}
        <a
          href="/agents"
          className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-brand/60"
        >
          Kelola Agent
        </a>
        {agent.current_task && (
          <a
            href="/tasks"
            className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-brand/60"
          >
            Lihat Task
          </a>
        )}
      </div>
    </div>
  );
}
