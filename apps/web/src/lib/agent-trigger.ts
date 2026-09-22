import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "./db";
import { agents, messages, roomMembers } from "./db/schema";
import { enqueueAgentJob } from "./jobs";

/**
 * Menentukan agent mana yang harus "bangun" ketika sebuah pesan masuk room,
 * lalu meng-enqueue job ke Redis Streams.
 *
 * Aturan (Fase 3):
 * - Agent harus **member** dari room tersebut.
 * - Agent dipicu bila di-mention (`@Nama`) ATAU pesan adalah reply ke
 *   pesan agent (menjaga percakapan dua arah berjalan).
 * - Author agent lain tidak memicu dirinya sendiri.
 */
export async function triggerAgentsFromMessage(input: {
  companyId: string;
  roomId: string;
  messageId: string;
  text: string;
  mentions: string[];
  authorUserId?: string | null;
  authorAgentId?: string | null;
  replyToId?: string | null;
}): Promise<string[]> {
  const candidates = new Set(input.mentions.filter(Boolean));

  // Reply ke pesan agent → agent tersebut ikut dipicu.
  if (input.replyToId) {
    const [parent] = await db
      .select({ authorAgentId: messages.authorAgentId })
      .from(messages)
      .where(eq(messages.id, input.replyToId))
      .limit(1);
    if (parent?.authorAgentId) candidates.add(parent.authorAgentId);
  }

  if (candidates.size === 0) return [];

  const ids = [...candidates].filter((id) => id !== input.authorAgentId);

  // Pastikan hanya agent yang benar-benar member room yang dijalankan.
  const members = await db
    .select({ agentId: roomMembers.agentId })
    .from(roomMembers)
    .innerJoin(agents, and(eq(agents.id, roomMembers.agentId), isNull(agents.deletedAt)))
    .where(and(eq(roomMembers.roomId, input.roomId), inArray(roomMembers.agentId, ids)));

  const runnable = members.map((m) => m.agentId).filter((id): id is string => Boolean(id));
  if (runnable.length === 0) return [];

  const jobIds: string[] = [];
  for (const agentId of runnable) {
    jobIds.push(
      await enqueueAgentJob({
        companyId: input.companyId,
        agentId,
        roomId: input.roomId,
        trigger: {
          kind: "room.mention",
          message_id: input.messageId,
          user_id: input.authorUserId ?? null,
          text: input.text,
        },
      }),
    );
  }
  return jobIds;
}
