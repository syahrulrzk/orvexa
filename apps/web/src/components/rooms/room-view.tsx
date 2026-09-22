"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import type { AgentOption, RoomMessage } from "./types";

type WireMessage = {
  id: string;
  room_id: string;
  thread_root_id?: string | null;
  author_type: string;
  author_user_id?: string | null;
  author_agent_id?: string | null;
  kind: string;
  content: string | null;
  mentions?: string[];
  created_at: string;
  user_name?: string | null;
  agent_name?: string | null;
  agent_role?: string | null;
};

function fromWire(w: WireMessage): RoomMessage {
  return {
    id: w.id,
    roomId: w.room_id,
    threadRootId: w.thread_root_id ?? null,
    authorType: w.author_type,
    authorUserId: w.author_user_id ?? null,
    authorAgentId: w.author_agent_id ?? null,
    kind: w.kind,
    content: w.content,
    mentions: w.mentions ?? [],
    createdAt: w.created_at,
    authorName: w.agent_name ?? w.user_name ?? null,
    authorRole: w.agent_role ?? null,
  };
}

const STATUS_COLOR: Record<string, string> = {
  idle: "bg-success",
  thinking: "bg-info",
  working: "bg-warning",
  waiting_approval: "bg-warning",
  error: "bg-danger",
  disabled: "bg-neutral",
};

function MessageBubble({ message, isOwn }: { message: RoomMessage; isOwn: boolean }) {
  const isAgent = message.authorType === "agent";

  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium",
          isAgent ? "bg-brand text-brand-fg" : isOwn ? "bg-info/20 text-info" : "bg-secondary",
        )}
        aria-hidden
      >
        {(message.authorName ?? "?").slice(0, 1).toUpperCase()}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">
            {message.authorName ?? "Unknown"}
          </span>
          {isAgent ? <Badge variant="outline">{message.authorRole ?? "agent"}</Badge> : null}
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
          {message.content}
        </p>
      </div>
    </div>
  );
}

export function RoomView({
  roomId,
  initialMessages,
  agents,
  currentUserId,
}: {
  roomId: string;
  initialMessages: RoomMessage[];
  agents: AgentOption[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, a.status])),
  );
  const listRef = useRef<HTMLDivElement>(null);

  // SSE: berlangganan event room.
  useEffect(() => {
    const source = new EventSource(`/api/v1/rooms/${roomId}/events`);

    source.addEventListener("ready", () => setConnected(true));

    source.addEventListener("message.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { message: WireMessage };
      const message = fromWire(data.message);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    });

    source.addEventListener("agent.status", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        agent_id?: string;
        payload?: { status?: string };
      };
      if (data.agent_id) {
        setAgentStatus((prev) => ({ ...prev, [data.agent_id!]: data.payload?.status ?? "idle" }));
      }
    });

    source.onerror = () => setConnected(false);
    source.onopen = () => setConnected(true);

    return () => source.close();
  }, [roomId]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const mentionQuery = useMemo(() => {
    const match = /(?:^|\s)@([\w-]*)$/.exec(draft);
    return match ? match[1].toLowerCase() : null;
  }, [draft]);

  const mentionSuggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    return agents.filter((a) => a.label.toLowerCase().includes(mentionQuery)).slice(0, 6);
  }, [agents, mentionQuery]);

  function insertMention(label: string) {
    setDraft((prev) => prev.replace(/(?:^|\s)@([\w-]*)$/, (m) => `${m.startsWith(" ") ? " " : ""}@${label} `));
  }

  async function send() {
    const content = draft.trim();
    if (!content || pending) return;

    const mentions = agents
      .filter((a) => content.toLowerCase().includes(`@${a.label.toLowerCase()}`))
      .map((a) => a.id);

    setPending(true);
    const res = await fetch(`/api/v1/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions, kind: "text" }),
    });
    setPending(false);

    if (!res.ok) return;

    setDraft("");
    const body = (await res.json().catch(() => null)) as { data?: { message?: { id: string } } } | null;
    const optimistic: RoomMessage = {
      id: body?.data?.message?.id ?? `local-${Date.now()}`,
      roomId,
      threadRootId: null,
      authorType: "human",
      authorUserId: currentUserId,
      authorAgentId: null,
      kind: "text",
      content,
      mentions,
      createdAt: new Date().toISOString(),
      authorName: "You",
      authorRole: null,
    };
    setMessages((prev) => (prev.some((m) => m.id === optimistic.id) ? prev : [...prev, optimistic]));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-end gap-2 border-b border-border px-6 py-2">
        <span
          className={cn("h-2 w-2 rounded-full", connected ? "bg-success" : "bg-danger")}
          aria-hidden
        />
        <span className="text-xs text-muted-foreground">{connected ? "live" : "terputus"}</span>
      </div>

      <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada pesan. Mulai percakapan atau mention agent dengan <code>@Nama</code>.
          </p>
        ) : (
          messages.map((m) => (
            <MessageBubble key={m.id} message={m} isOwn={m.authorUserId === currentUserId} />
          ))
        )}
      </div>

      <div className="border-t border-border p-4">
        {agents.length > 0 ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {agents.map((a) => (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground"
              >
                <span
                  className={cn("h-1.5 w-1.5 rounded-full", STATUS_COLOR[agentStatus[a.id] ?? "idle"])}
                  aria-hidden
                />
                {a.label}
              </span>
            ))}
          </div>
        ) : null}

        {mentionSuggestions.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1 rounded-md border border-border bg-card p-2">
            {mentionSuggestions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => insertMention(a.label)}
                className="rounded-md border border-border px-2 py-0.5 text-xs hover:bg-accent"
              >
                @{a.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={2}
            placeholder="Tulis pesan... (Enter kirim, Shift+Enter baris baru, @mention agent)"
            className="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button onClick={() => void send()} disabled={pending || draft.trim().length === 0}>
            {pending ? "..." : "Send"}
          </Button>
        </div>
      </div>
    </div>
  );
}
