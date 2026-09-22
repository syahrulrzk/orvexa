"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { QUICK_REACTIONS, type AgentOption, type AttachmentMeta, type RoomMessage } from "./types";

// ---------------------------------------------------------------
// Wire types (snake_case dari API/SSE)
// ---------------------------------------------------------------
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
  meta?: { attachments?: AttachmentMeta[] } | null;
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
    attachments: w.meta?.attachments ?? [],
    reactions: [],
    replyCount: 0,
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

const SLASH_COMMANDS = [
  { cmd: "/help", description: "Tampilkan daftar perintah" },
  { cmd: "/me", description: "Kirim sebagai aksi (emote)" },
  { cmd: "/alert", description: "Kirim pesan alert" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function applyReactionUpdate(
  list: RoomMessage[],
  messageId: string,
  emoji: string,
  delta: 1 | -1,
  affectsMine: boolean,
): RoomMessage[] {
  return list.map((m) => {
    if (m.id !== messageId) return m;
    const reactions = [...m.reactions];
    const idx = reactions.findIndex((r) => r.emoji === emoji);
    if (idx === -1) {
      if (delta < 0) return m;
      reactions.push({ emoji, count: 1, mine: affectsMine });
    } else {
      const current = reactions[idx];
      const count = current.count + delta;
      const mine = affectsMine ? delta > 0 : current.mine;
      if (count <= 0) reactions.splice(idx, 1);
      else reactions[idx] = { emoji, count, mine };
    }
    return { ...m, reactions };
  });
}

// ---------------------------------------------------------------
// Message item
// ---------------------------------------------------------------
function MessageItem({
  message,
  isOwn,
  onReact,
  onOpenThread,
}: {
  message: RoomMessage;
  isOwn: boolean;
  onReact: (emoji: string) => void;
  onOpenThread: () => void;
}) {
  const isAgent = message.authorType === "agent";
  const isAlert = message.kind === "alert";
  const isEmote = message.mentions.length === 0 && message.content?.startsWith("_") === true;

  return (
    <div id={`msg-${message.id}`} className={cn("group flex gap-3", isAlert && "border-l-2 border-danger pl-3")}>
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
          <span className="text-sm font-medium text-foreground">{message.authorName ?? "Unknown"}</span>
          {isAgent ? <Badge variant="outline">{message.authorRole ?? "agent"}</Badge> : null}
          {isAlert ? <Badge variant="danger">alert</Badge> : null}
          <span className="text-xs text-muted-foreground">{formatTime(message.createdAt)}</span>
        </div>

        <p
          className={cn(
            "mt-1 whitespace-pre-wrap break-words text-sm text-foreground",
            isEmote && "italic text-muted-foreground",
          )}
        >
          {message.content}
        </p>

        {message.attachments.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {message.attachments.map((a) => (
              <li key={a.id}>
                <a
                  href={`/api/v1/attachments/${a.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs text-foreground hover:bg-accent"
                >
                  📎 <span className="underline">{a.file_name}</span>
                  <span className="text-muted-foreground">{formatBytes(a.size_bytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {message.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => onReact(r.emoji)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-xs",
                r.mine ? "border-info bg-info/10 text-info" : "border-border text-muted-foreground",
              )}
            >
              {r.emoji} {r.count}
            </button>
          ))}

          <div className="hidden gap-0.5 group-hover:flex">
            {QUICK_REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`Reaksi ${emoji}`}
                onClick={() => onReact(emoji)}
                className="rounded-full border border-border px-1.5 py-0.5 text-xs hover:bg-accent"
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenThread}
            className="ml-1 text-xs text-muted-foreground hover:underline"
          >
            {message.replyCount > 0 ? `${message.replyCount} balasan` : "Balas di thread"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Main view
// ---------------------------------------------------------------
export function RoomView({
  roomId,
  initialMessages,
  agents,
  currentUserId,
  currentUserName,
}: {
  roomId: string;
  initialMessages: RoomMessage[];
  agents: AgentOption[];
  currentUserId: string;
  currentUserName: string;
}) {
  const [messages, setMessages] = useState<RoomMessage[]>(initialMessages);
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<Record<string, string>>(() =>
    Object.fromEntries(agents.map((a) => [a.id, a.status])),
  );
  const [typing, setTyping] = useState<Record<string, { name: string; at: number }>>({});

  const [threadRoot, setThreadRoot] = useState<RoomMessage | null>(null);
  const [threadReplies, setThreadReplies] = useState<RoomMessage[]>([]);
  const [threadDraft, setThreadDraft] = useState("");
  const [threadPending, setThreadPending] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<RoomMessage[] | null>(null);
  const [searching, setSearching] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTypingSent = useRef(0);
  const threadRootRef = useRef<RoomMessage | null>(null);

  useEffect(() => {
    threadRootRef.current = threadRoot;
  }, [threadRoot]);

  // --- SSE ---
  useEffect(() => {
    const source = new EventSource(`/api/v1/rooms/${roomId}/events`);
    source.addEventListener("ready", () => setConnected(true));
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.addEventListener("message.created", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { message: WireMessage };
      const incoming = fromWire(data.message);

      if (incoming.threadRootId) {
        if (threadRootRef.current?.id === incoming.threadRootId) {
          setThreadReplies((prev) =>
            prev.some((r) => r.id === incoming.id) ? prev : [...prev, incoming],
          );
        }
        setMessages((prev) =>
          prev.map((m) => (m.id === incoming.threadRootId ? { ...m, replyCount: m.replyCount + 1 } : m)),
        );
        return;
      }

      setMessages((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
    });

    source.addEventListener("reaction.added", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        message_id: string;
        emoji: string;
        user_id?: string;
      };
      const mine = data.user_id === currentUserId;
      setMessages((prev) => applyReactionUpdate(prev, data.message_id, data.emoji, 1, mine));
      setThreadReplies((prev) => applyReactionUpdate(prev, data.message_id, data.emoji, 1, mine));
    });

    source.addEventListener("reaction.removed", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as {
        message_id: string;
        emoji: string;
        user_id?: string;
      };
      const mine = data.user_id === currentUserId;
      setMessages((prev) => applyReactionUpdate(prev, data.message_id, data.emoji, -1, mine));
      setThreadReplies((prev) => applyReactionUpdate(prev, data.message_id, data.emoji, -1, mine));
    });

    source.addEventListener("typing", (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { user_id?: string; name?: string };
      if (!data.user_id || data.user_id === currentUserId) return;
      setTyping((prev) => ({ ...prev, [data.user_id!]: { name: data.name ?? "Seseorang", at: Date.now() } }));
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

    return () => source.close();
  }, [roomId, currentUserId]);

  // Bersihkan indikator mengetik yang kadaluwarsa.
  useEffect(() => {
    const timer = setInterval(() => {
      setTyping((prev) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(prev).filter(([, v]) => now - v.at < 4000));
        return Object.keys(next).length === Object.keys(prev).length ? prev : next;
      });
    }, 1500);
    return () => clearInterval(timer);
  }, []);

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

  const slashQuery = useMemo(() => {
    if (!draft.startsWith("/") || draft.includes(" ")) return null;
    return draft.slice(1).toLowerCase();
  }, [draft]);

  const slashSuggestions = useMemo(() => {
    if (slashQuery === null) return [];
    return SLASH_COMMANDS.filter((c) => c.cmd.slice(1).startsWith(slashQuery));
  }, [slashQuery]);

  function insertMention(label: string) {
    setDraft((prev) => prev.replace(/(?:^|\s)@([\w-]*)$/, (m) => `${m.startsWith(" ") ? " " : ""}@${label} `));
  }

  function sendTyping() {
    const now = Date.now();
    if (now - lastTypingSent.current < 2000) return;
    lastTypingSent.current = now;
    void fetch(`/api/v1/rooms/${roomId}/typing`, { method: "POST" });
  }

  async function postMessage(content: string, extra: { kind?: "text" | "alert"; meta?: Record<string, unknown> }) {
    const mentions = agents
      .filter((a) => content.toLowerCase().includes(`@${a.label.toLowerCase()}`))
      .map((a) => a.id);

    return fetch(`/api/v1/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, mentions, kind: extra.kind ?? "text", meta: extra.meta }),
    });
  }

  function appendOptimistic(message: RoomMessage) {
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }

  async function send() {
    const raw = draft.trim();
    if (!raw || pending) return;

    // Slash commands
    if (raw.startsWith("/")) {
      const [cmd, ...rest] = raw.split(/\s+/);
      const arg = rest.join(" ").trim();

      if (cmd === "/help") {
        setNotice(`Perintah: ${SLASH_COMMANDS.map((c) => c.cmd).join(", ")}`);
        setDraft("");
        return;
      }
      if (cmd === "/me") {
        if (!arg) return;
        setPending(true);
        const res = await postMessage(`_${currentUserName} ${arg}_`, { meta: { emote: true } });
        setPending(false);
        if (!res.ok) return;
        setDraft("");
        const body = (await res.json().catch(() => null)) as { data?: { message?: { id: string } } } | null;
        appendOptimistic({
          id: body?.data?.message?.id ?? `local-${Date.now()}`,
          roomId,
          threadRootId: null,
          authorType: "human",
          authorUserId: currentUserId,
          authorAgentId: null,
          kind: "text",
          content: `_${currentUserName} ${arg}_`,
          mentions: [],
          createdAt: new Date().toISOString(),
          authorName: currentUserName,
          authorRole: null,
          attachments: [],
          reactions: [],
          replyCount: 0,
        });
        return;
      }
      if (cmd === "/alert") {
        if (!arg) return;
        setPending(true);
        const res = await postMessage(arg, { kind: "alert", meta: { alert: true } });
        setPending(false);
        if (!res.ok) return;
        setDraft("");
        const body = (await res.json().catch(() => null)) as { data?: { message?: { id: string } } } | null;
        appendOptimistic({
          id: body?.data?.message?.id ?? `local-${Date.now()}`,
          roomId,
          threadRootId: null,
          authorType: "human",
          authorUserId: currentUserId,
          authorAgentId: null,
          kind: "alert",
          content: arg,
          mentions: [],
          createdAt: new Date().toISOString(),
          authorName: currentUserName,
          authorRole: null,
          attachments: [],
          reactions: [],
          replyCount: 0,
        });
        return;
      }
      // perintah tidak dikenal → kirim sebagai teks biasa
    }

    setPending(true);
    const res = await postMessage(raw, {});
    setPending(false);
    if (!res.ok) return;

    setDraft("");
    const body = (await res.json().catch(() => null)) as { data?: { message?: { id: string } } } | null;
    appendOptimistic({
      id: body?.data?.message?.id ?? `local-${Date.now()}`,
      roomId,
      threadRootId: null,
      authorType: "human",
      authorUserId: currentUserId,
      authorAgentId: null,
      kind: "text",
      content: raw,
      mentions: [],
      createdAt: new Date().toISOString(),
      authorName: currentUserName,
      authorRole: null,
      attachments: [],
      reactions: [],
      replyCount: 0,
    });
  }

  async function toggleReaction(messageId: string, emoji: string, mine: boolean) {
    if (mine) {
      await fetch(`/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
        method: "DELETE",
      });
      setMessages((prev) => applyReactionUpdate(prev, messageId, emoji, -1, true));
      setThreadReplies((prev) => applyReactionUpdate(prev, messageId, emoji, -1, true));
      return;
    }
    await fetch(`/api/v1/messages/${messageId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    setMessages((prev) => applyReactionUpdate(prev, messageId, emoji, 1, true));
    setThreadReplies((prev) => applyReactionUpdate(prev, messageId, emoji, 1, true));
  }

  async function openThread(root: RoomMessage) {
    setThreadRoot(root);
    setThreadReplies([]);
    const res = await fetch(`/api/v1/messages/${root.id}/thread`);
    if (!res.ok) return;
    const body = (await res.json().catch(() => null)) as { data?: { replies?: WireMessage[] } } | null;
    setThreadReplies((body?.data?.replies ?? []).map(fromWire));
  }

  async function sendThreadReply() {
    if (!threadRoot || !threadDraft.trim() || threadPending) return;
    setThreadPending(true);
    const content = threadDraft.trim();
    const res = await fetch(`/api/v1/messages/${threadRoot.id}/thread`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setThreadPending(false);
    if (!res.ok) return;
    setThreadDraft("");
    const body = (await res.json().catch(() => null)) as { data?: { reply?: { id: string } } } | null;
    const optimistic: RoomMessage = {
      id: body?.data?.reply?.id ?? `local-${Date.now()}`,
      roomId,
      threadRootId: threadRoot.id,
      authorType: "human",
      authorUserId: currentUserId,
      authorAgentId: null,
      kind: "text",
      content,
      mentions: [],
      createdAt: new Date().toISOString(),
      authorName: currentUserName,
      authorRole: null,
      attachments: [],
      reactions: [],
      replyCount: 0,
    };
    setThreadReplies((prev) => (prev.some((r) => r.id === optimistic.id) ? prev : [...prev, optimistic]));
    setMessages((prev) =>
      prev.map((m) => (m.id === threadRoot.id ? { ...m, replyCount: m.replyCount + 1 } : m)),
    );
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setNotice(null);
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`/api/v1/rooms/${roomId}/attachments`, { method: "POST", body: form });
    setUploading(false);
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setNotice(body?.error?.message ?? "Gagal mengunggah file.");
    }
  }

  async function runSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setSearching(true);
    const res = await fetch(`/api/v1/rooms/${roomId}/search?q=${encodeURIComponent(q)}`);
    setSearching(false);
    if (!res.ok) {
      setSearchResults([]);
      return;
    }
    const body = (await res.json().catch(() => null)) as { data?: { results?: WireMessage[] } } | null;
    setSearchResults((body?.data?.results ?? []).map(fromWire));
  }

  const typingNames = Object.values(typing).map((t) => t.name);

  return (
    <div className="relative flex min-h-0 flex-1">
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-border px-6 py-2">
          <form onSubmit={runSearch} className="flex flex-1 items-center gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari pesan di room ini..."
              className="h-8 max-w-xs text-xs"
              aria-label="Cari pesan"
            />
            <Button type="submit" size="sm" variant="outline" disabled={searching}>
              {searching ? "..." : "Cari"}
            </Button>
            {searchResults ? (
              <Button type="button" size="sm" variant="ghost" onClick={() => setSearchResults(null)}>
                Tutup
              </Button>
            ) : null}
          </form>
          <span className={cn("h-2 w-2 rounded-full", connected ? "bg-success" : "bg-danger")} aria-hidden />
          <span className="text-xs text-muted-foreground">{connected ? "live" : "terputus"}</span>
        </div>

        {searchResults ? (
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-6">
            <p className="text-xs text-muted-foreground">
              {searchResults.length} hasil untuk &ldquo;{searchQuery}&rdquo;
            </p>
            {searchResults.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setSearchResults(null);
                  document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: "smooth" });
                }}
                className="block w-full rounded-md border border-border bg-card p-3 text-left hover:bg-accent/40"
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.authorName ?? "Unknown"}</span>
                  <span>{formatTime(m.createdAt)}</span>
                  {m.threadRootId ? <Badge variant="secondary">thread</Badge> : null}
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-foreground">{m.content}</p>
              </button>
            ))}
          </div>
        ) : (
          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {messages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Belum ada pesan. Ketik <code>/help</code> untuk perintah, atau mention agent dengan{" "}
                <code>@Nama</code>.
              </p>
            ) : (
              messages.map((m) => (
                <MessageItem
                  key={m.id}
                  message={m}
                  isOwn={m.authorUserId === currentUserId}
                  onReact={(emoji) => {
                    const mine = m.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
                    void toggleReaction(m.id, emoji, mine);
                  }}
                  onOpenThread={() => void openThread(m)}
                />
              ))
            )}
          </div>
        )}

        {typingNames.length > 0 ? (
          <p className="px-6 pb-1 text-xs italic text-muted-foreground">
            {typingNames.join(", ")} sedang mengetik...
          </p>
        ) : null}

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

          {notice ? (
            <p className="mb-2 rounded-md border border-border bg-canvas-subtle px-2 py-1 text-xs text-muted-foreground">
              {notice}
            </p>
          ) : null}

          {slashSuggestions.length > 0 ? (
            <div className="mb-2 space-y-1 rounded-md border border-border bg-card p-2">
              {slashSuggestions.map((c) => (
                <button
                  key={c.cmd}
                  type="button"
                  onClick={() => setDraft(`${c.cmd} `)}
                  className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent"
                >
                  <span className="font-mono text-foreground">{c.cmd}</span>
                  <span className="ml-2 text-muted-foreground">{c.description}</span>
                </button>
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
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Lampirkan file"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? "…" : "📎"}
            </Button>
            <textarea
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                setNotice(null);
                if (e.target.value.trim()) sendTyping();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={2}
              placeholder="Tulis pesan... (Enter kirim · Shift+Enter baris baru · /perintah · @mention)"
              className="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button onClick={() => void send()} disabled={pending || draft.trim().length === 0}>
              {pending ? "..." : "Send"}
            </Button>
          </div>
        </div>
      </div>

      {threadRoot ? (
        <div className="flex w-context shrink-0 flex-col border-l border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold text-foreground">Thread</span>
            <Button variant="ghost" size="sm" onClick={() => setThreadRoot(null)}>
              Tutup
            </Button>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <MessageItem
              message={threadRoot}
              isOwn={threadRoot.authorUserId === currentUserId}
              onReact={(emoji) => {
                const mine = threadRoot.reactions.find((r) => r.emoji === emoji)?.mine ?? false;
                void toggleReaction(threadRoot.id, emoji, mine);
              }}
              onOpenThread={() => {}}
            />
            <div className="border-t border-border pt-3">
              {threadReplies.length === 0 ? (
                <p className="text-xs text-muted-foreground">Belum ada balasan.</p>
              ) : (
                threadReplies.map((r) => (
                  <MessageItem
                    key={r.id}
                    message={r}
                    isOwn={r.authorUserId === currentUserId}
                    onReact={(emoji) => {
                      const mine = r.reactions.find((x) => x.emoji === emoji)?.mine ?? false;
                      void toggleReaction(r.id, emoji, mine);
                    }}
                    onOpenThread={() => {}}
                  />
                ))
              )}
            </div>
          </div>

          <div className="border-t border-border p-3">
            <textarea
              value={threadDraft}
              onChange={(e) => setThreadDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendThreadReply();
                }
              }}
              rows={2}
              placeholder="Balas di thread..."
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={() => void sendThreadReply()} disabled={threadPending || !threadDraft.trim()}>
                {threadPending ? "..." : "Balas"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
