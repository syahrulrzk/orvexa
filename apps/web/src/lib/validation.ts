import { z } from "zod";

export const roomTypeSchema = z.enum([
  "general",
  "department",
  "incident",
  "project",
  "war_room",
  "direct",
]);

export const createRoomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: roomTypeSchema.default("general"),
  topic: z.string().trim().max(500).nullish(),
  project_id: z.string().nullish(),
  member_agent_ids: z.array(z.string()).max(50).optional(),
});

export const updateRoomSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  topic: z.string().trim().max(500).nullish(),
  is_archived: z.boolean().optional(),
});

export const addRoomMemberSchema = z
  .object({
    agent_id: z.string().nullish(),
    user_id: z.string().nullish(),
    role: z.enum(["member", "observer", "lead"]).default("member"),
  })
  .refine(
    (d) => (d.agent_id ? 1 : 0) + (d.user_id ? 1 : 0) === 1,
    { message: "Isi salah satu: agent_id atau user_id" },
  );

export const createMessageSchema = z.object({
  content: z.string().min(1).max(20000),
  kind: z.enum(["text", "alert"]).default("text"),
  mentions: z.array(z.string()).max(50).optional(),
  thread_root_id: z.string().nullish(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().optional(),
});
