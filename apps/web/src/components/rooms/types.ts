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
};

export type AgentOption = {
  id: string;
  label: string;
  status: string;
};
