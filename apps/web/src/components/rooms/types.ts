export type AttachmentMeta = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};

export type MessageReaction = {
  emoji: string;
  count: number;
  mine: boolean;
};

export type RoomMessage = {
  id: string;
  roomId: string;
  threadRootId: string | null;
  authorType: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  kind: string;
  content: string | null;
  mentions: string[];
  createdAt: string;
  authorName: string | null;
  authorRole: string | null;
  attachments: AttachmentMeta[];
  reactions: MessageReaction[];
  replyCount: number;
};

export type AgentOption = {
  id: string;
  label: string;
  status: string;
};

export const QUICK_REACTIONS = ["👍", "✅", "🔥", "👀", "⚠️"] as const;
