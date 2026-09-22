import { and, eq, sql } from "drizzle-orm";

import { db } from "./db";
import { agentKnowledge, knowledgeAcl, knowledgeChunks, knowledgeDocuments } from "./db/schema";
import { resolveEmbedder } from "./embeddings";

/**
 * RAG retrieval (F4-05) dengan **pre-filter permission**.
 *
 * Aturan akses (fail-closed):
 * 1. Chunk hanya dari dokumen yang `deletedAt IS NULL` dan status `ready`.
 * 2. Agent harus punya akses ke knowledge base-nya lewat `agent_knowledge`
 *    (can_read = true), KECUALI `agent_knowledge` untuk agent itu kosong
 *    → fallback: dokumen scope `company` saja.
 * 3. Bila dokumen punya baris `knowledge_acl`, minimal satu ACL harus
 *    mengizinkan agent (subject_type='agent' + subject_id) ATAU
 *    (subject_type='company' → semua member company).
 * 4. Filter scope dokumen: company selalu boleh; team/project/room/agent
 *    hanya bila scope_id cocok dengan konteks run (bila diberikan).
 */

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  content: string;
  similarity: number;
};

export type RetrievalOptions = {
  companyId: string;
  agentId: string;
  query: string;
  limit?: number;
  kbId?: string | null;
  roomId?: string | null;
  projectId?: string | null;
  /**
   * `agent` (default): ACL penuh per agent.
   * `human`: sudah digate RBAC `knowledge.read` di route; ACL per-agent
   * di-skip, cukup filter scope dokumen.
   */
  aclMode?: "agent" | "human";
};

export class RetrievalError extends Error {}

export async function retrieveChunks(opts: RetrievalOptions): Promise<RetrievedChunk[]> {
  const limit = Math.min(opts.limit ?? 5, 20);

  const aclMode = opts.aclMode ?? "agent";

  // --- 1. Tentukan KB yang boleh dibaca (untuk mode agent) ---
  const grants =
    aclMode === "agent"
      ? await db
          .select({ kbId: agentKnowledge.knowledgeBaseId })
          .from(agentKnowledge)
          .where(and(eq(agentKnowledge.agentId, opts.agentId), eq(agentKnowledge.canRead, true)))
      : [];

  const allowedKbIds = grants.map((g) => g.kbId);
  const fallbackCompanyWide = aclMode === "human" || allowedKbIds.length === 0;

  if (opts.kbId && aclMode === "agent") {
    const allowed =
      fallbackCompanyWide ||
      allowedKbIds.includes(opts.kbId) ||
      (await isCompanyWideKb(opts.kbId));
    if (!allowed) {
      throw new RetrievalError("Agent tidak punya akses ke knowledge base ini.");
    }
  }

  const kbFilter =
    opts.kbId
      ? sql`d.knowledge_base_id = ${opts.kbId}`
      : fallbackCompanyWide
        ? sql`d.scope = 'company'`
        : sql`(d.knowledge_base_id IN ${allowedKbIds} OR d.scope = 'company')`;

  // --- 2. Embed query ---
  const embedder = await resolveEmbedder(opts.companyId);
  const [queryVector] = await embedder.embed([opts.query]);

  // --- 3. Similarity search DENGAN filter di SQL (pre-filter) ---
  const scopeFilter = sql`(
    d.scope = 'company'
    OR (d.scope = 'room' AND d.scope_id = ${opts.roomId ?? null})
    OR (d.scope = 'project' AND d.scope_id = ${opts.projectId ?? null})
    OR (d.scope = 'agent' AND d.scope_id = ${opts.agentId})
  )`;

  // ACL per-dokumen hanya untuk mode agent (human sudah digate RBAC).
  const aclFilter =
    aclMode === "agent"
      ? sql`AND EXISTS (
          SELECT 1 FROM knowledge_acl a
          WHERE a.document_id = d.id
            AND (
              (a.subject_type = 'agent' AND a.subject_id = ${opts.agentId} AND a.can_read)
              OR (a.subject_type = 'company' AND a.can_read)
            )
        )`
      : sql``;

  const rows = await db
    .select({
      chunk_id: knowledgeChunks.id,
      document_id: knowledgeChunks.documentId,
      document_title: knowledgeDocuments.title,
      chunk_index: knowledgeChunks.chunkIndex,
      content: knowledgeChunks.content,
      similarity: sql<number>`1 - (c.embedding <=> ${JSON.stringify(queryVector)}::vector)`,
    })
    .from(sql`knowledge_chunks c
      JOIN knowledge_documents d ON d.id = c.document_id`)
    .where(
      sql`d.company_id = ${opts.companyId}
        AND d.deleted_at IS NULL
        AND d.status = 'ready'
        AND ${kbFilter}
        AND ${scopeFilter}
        ${aclFilter}`,
    )
    .orderBy(sql`c.embedding <=> ${JSON.stringify(queryVector)}::vector`)
    .limit(limit);

  return rows;
}

async function isCompanyWideKb(kbId: string): Promise<boolean> {
  // KB dipakai company-wide bila agent_knowledge punya grant untuk
  // minimal satu agent bawaan — pragmatis: cek ada/tidaknya baris ACL
  // company pada dokumen KB itu. Sederhananya: KB tanpa grant khusus
  // dianggap terbuka bila pemanggil menyertakan kb_id eksplisit dari UI.
  const rows = await db
    .select({ id: knowledgeAcl.id })
    .from(knowledgeAcl)
    .innerJoin(
      knowledgeDocuments,
      and(
        eq(knowledgeAcl.documentId, knowledgeDocuments.id),
        eq(knowledgeDocuments.knowledgeBaseId, kbId),
      ),
    )
    .where(and(eq(knowledgeAcl.subjectType, "company"), eq(knowledgeAcl.canRead, true)))
    .limit(1);
  return rows.length > 0;
}
