import { and, eq } from "drizzle-orm";

import { db } from "./db";
import { messages } from "./db/schema";

export type MessageRef = {
  id: string;
  roomId: string;
  companyId: string;
  threadRootId: string | null;
  authorUserId: string | null;
};

/** Ambil pesan dengan pengecekan scope company. Return null bila tidak ada. */
export async function loadMessageForCompany(
  messageId: string,
  companyId: string,
): Promise<MessageRef | null> {
  const [row] = await db
    .select({
      id: messages.id,
      roomId: messages.roomId,
      companyId: messages.companyId,
      threadRootId: messages.threadRootId,
      authorUserId: messages.authorUserId,
    })
    .from(messages)
    .where(
      and(eq(messages.id, messageId), eq(messages.companyId, companyId), eq(messages.isDeleted, false)),
    )
    .limit(1);
  return row ?? null;
}
