import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "./db";
import { agentMemories, rooms } from "./db/schema";
import { newId } from "./ids";

/**
 * Agent memory (F4-03) — 4 scope sesuai PRD §23:
 *
 * - `conversation` → scope_id = room_id   (ingatan percakapan room ini)
 * - `project`      → scope_id = project_id (ingatan proyek)
 * - `company`      → scope_id = null      (fakta lintas room, milik company)
 * - `agent`        → scope_id = null      (preferensi/kebiasaan agent itu sendiri)
 *
 * Penyimpanan di tabel `agent_memories`. Retrieval memakai pgvector
 * (cosine distance) bila embedding tersedia; fallback ke recency.
 */

export const MEMORY_SCOPES = ["conversation", "project", "company", "agent"] as const;
export type MemoryScope = (typeof MEMORY_SCOPES)[number];

export type MemoryItem = {
  id: string;
  agent_id: string;
  scope: MemoryScope;
  scope_id: string | null;
  content: string;
  importance: number;
  created_at: string;
};

/** Simpan memory baru (opsional dengan embedding). */
export async function saveMemory(input: {
  companyId: string;
  agentId: string;
  scope: MemoryScope;
  scopeId?: string | null;
  content: string;
  importance?: number;
  embedding?: number[] | null;
}): Promise<MemoryItem> {
  const [row] = await db
    .insert(agentMemories)
    .values({
      id: newId("mem"),
      companyId: input.companyId,
      agentId: input.agentId,
      scope: input.scope,
      scopeId: input.scopeId ?? null,
      content: input.content,
      importance: String(Math.min(1, Math.max(0, input.importance ?? 0.5))),
      ...(input.embedding ? { embedding: input.embedding } : {}),
    })
    .returning({
      id: agentMemories.id,
      agentId: agentMemories.agentId,
      scope: agentMemories.scope,
      scopeId: agentMemories.scopeId,
      content: agentMemories.content,
      importance: agentMemories.importance,
      createdAt: agentMemories.createdAt,
    });

  return {
    id: row.id,
    agent_id: row.agentId,
    scope: row.scope as MemoryScope,
    scope_id: row.scopeId,
    content: row.content,
    importance: Number(row.importance),
    created_at: row.createdAt.toISOString(),
  };
}

type RecallOptions = {
  companyId: string;
  agentId: string;
  roomId?: string | null;
  projectId?: string | null;
  limit?: number;
};

/**
 * Recall memory kontekstual untuk satu run: gabungan keempat scope yang
 * relevan dengan room/project saat ini + ingatan `agent` selalu ikut.
 * Diurutkan berdasar importance lalu kebaruan.
 */
export async function recallMemories(opts: RecallOptions): Promise<MemoryItem[]> {
  const limit = Math.min(opts.limit ?? 10, 50);

  // Scope conversation ikut room ini; project ikut project room (bila ada);
  // company & agent tanpa scope_id.
  const [roomRow] = opts.roomId
    ? await db
        .select({ projectId: rooms.projectId })
        .from(rooms)
        .where(and(eq(rooms.id, opts.roomId), eq(rooms.companyId, opts.companyId)))
        .limit(1)
    : [];

  const projectId = opts.projectId ?? roomRow?.projectId ?? null;

  const rows = await db
    .select({
      id: agentMemories.id,
      agentId: agentMemories.agentId,
      scope: agentMemories.scope,
      scopeId: agentMemories.scopeId,
      content: agentMemories.content,
      importance: agentMemories.importance,
      createdAt: agentMemories.createdAt,
    })
    .from(agentMemories)
    .where(
      and(
        eq(agentMemories.companyId, opts.companyId),
        eq(agentMemories.agentId, opts.agentId),
        sql`(
          (scope = 'conversation' AND scope_id = ${opts.roomId ?? null})
          OR (scope = 'project' AND scope_id = ${projectId})
          OR (scope = 'company' AND scope_id IS NULL)
          OR (scope = 'agent' AND scope_id IS NULL)
        )`,
        orExpiredNull(),
      ),
    )
    .orderBy(desc(agentMemories.importance), desc(agentMemories.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    agent_id: r.agentId,
    scope: r.scope as MemoryScope,
    scope_id: r.scopeId,
    content: r.content,
    importance: Number(r.importance),
    created_at: r.createdAt.toISOString(),
  }));
}

/** Memory belum kedaluwarsa (expires_at null atau di masa depan). */
function orExpiredNull() {
  return sql`(expires_at IS NULL OR expires_at > now())`;
}
