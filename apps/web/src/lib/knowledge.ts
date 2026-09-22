import { and, eq, isNull } from "drizzle-orm";

import { db } from "./db";
import { knowledgeBases, knowledgeChunks, knowledgeDocuments } from "./db/schema";
import { resolveEmbedder } from "./embeddings";

/**
 * Knowledge Base pipeline (F4-04): chunk → embed → index.
 *
 * Dokumen teks (md/txt/csv/json) langsung di-chunk; PDF/DOCX sengaja belum
 * didukung di MVP (disimpan saja, tidak diindex) agar tidak butuh parser
 * biner di Next.js. Roadmap: pindahkan ekstraksi ke worker Python (Fase 6).
 */

export const KB_SUPPORTED_EXTENSIONS = ["md", "markdown", "txt", "csv", "json"] as const;
export const KB_MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per dokumen

export type ChunkOptions = {
  size?: number; // target karakter per chunk (~4 char ≈ 1 token)
  overlap?: number;
};

/**
 * Chunking per paragraf dengan overlap.
 * Estimasi token: ~4 karakter per token (cukup untuk batching).
 */
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const size = Math.max(200, opts.size ?? 1600);
  const overlap = Math.min(opts.overlap ?? 200, Math.floor(size / 2));

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= size) return normalized ? [normalized] : [];

  const chunks: string[] = [];
  const paragraphs = normalized.split(/\n{2,}/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > size && current) {
      chunks.push(current.trim());
      current = current.length > overlap ? current.slice(-overlap) + "\n\n" + para : para;
    } else {
      current = current ? current + "\n\n" + para : para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  // Paragraf tunggal super panjang → hard split.
  const final: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= size * 2) {
      final.push(chunk);
      continue;
    }
    for (let i = 0; i < chunk.length; i += size - overlap) {
      final.push(chunk.slice(i, i + size).trim());
      if (i + size >= chunk.length) break;
    }
  }
  return final.filter(Boolean);
}

export type IndexResult = {
  document_id: string;
  chunks: number;
  tokens: number;
};

/**
 * Index dokumen: baca file → chunk → embed per batch → simpan ke
 * `knowledge_chunks`. Status dokumen: indexing → ready/failed.
 */
export async function indexKnowledgeDocument(input: {
  companyId: string;
  documentId: string;
}): Promise<IndexResult> {
  const [doc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.id, input.documentId),
        eq(knowledgeDocuments.companyId, input.companyId),
      ),
    )
    .limit(1);
  if (!doc) throw new Error("Dokumen tidak ditemukan.");

  const { readUpload } = await import("./storage");
  let text: string;
  try {
    const buf = await readUpload(doc.storageKey ?? "");
    text = buf.toString("utf-8");
  } catch {
    await db
      .update(knowledgeDocuments)
      .set({ status: "failed" })
      .where(eq(knowledgeDocuments.id, doc.id));
    throw new Error("Gagal membaca file dokumen dari storage.");
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    await db
      .update(knowledgeDocuments)
      .set({ status: "failed" })
      .where(eq(knowledgeDocuments.id, doc.id));
    throw new Error("Dokumen kosong atau tidak bisa di-chunk.");
  }

  await db
    .update(knowledgeDocuments)
    .set({ status: "indexing" })
    .where(eq(knowledgeDocuments.id, doc.id));

  try {
    const embedder = await resolveEmbedder(input.companyId);

    const BATCH = 32;
    let tokens = 0;
    for (let i = 0; i < chunks.length; i += BATCH) {
      const batch = chunks.slice(i, i + BATCH);
      const vectors = await embedder.embed(batch);
      const values = batch.map((content, j) => ({
        companyId: input.companyId,
        documentId: doc.id,
        chunkIndex: i + j,
        content,
        tokenCount: Math.ceil(content.length / 4),
        embedding: vectors[j],
        metadata: { doc_title: doc.title },
      }));
      await db.insert(knowledgeChunks).values(values);
      tokens += values.reduce((acc, v) => acc + (v.tokenCount ?? 0), 0);
    }

    await db
      .update(knowledgeDocuments)
      .set({ status: "ready", indexedAt: new Date(), tokenCount: tokens })
      .where(eq(knowledgeDocuments.id, doc.id));

    return { document_id: doc.id, chunks: chunks.length, tokens };
  } catch (err) {
    await db
      .update(knowledgeDocuments)
      .set({ status: "failed" })
      .where(eq(knowledgeDocuments.id, doc.id));
    throw err;
  }
}

/** Daftar KB milik company. */
export async function listKnowledgeBases(companyId: string) {
  return db
    .select({
      id: knowledgeBases.id,
      name: knowledgeBases.name,
      description: knowledgeBases.description,
      embeddingDim: knowledgeBases.embeddingDim,
      createdAt: knowledgeBases.createdAt,
    })
    .from(knowledgeBases)
    .where(and(eq(knowledgeBases.companyId, companyId), isNull(knowledgeBases.deletedAt)));
}
