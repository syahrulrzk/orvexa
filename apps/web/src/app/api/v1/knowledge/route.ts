import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { knowledgeBases, knowledgeDocuments } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { createKnowledgeBaseSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET: daftar KB + dokumen (ringkas). */
export async function GET(): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const bases = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(eq(knowledgeBases.companyId, auth.company!.id), isNull(knowledgeBases.deletedAt)),
    )
    .orderBy(desc(knowledgeBases.createdAt));

  const docs = await db
    .select({
      id: knowledgeDocuments.id,
      knowledge_base_id: knowledgeDocuments.knowledgeBaseId,
      title: knowledgeDocuments.title,
      source_type: knowledgeDocuments.sourceType,
      status: knowledgeDocuments.status,
      token_count: knowledgeDocuments.tokenCount,
      created_at: knowledgeDocuments.createdAt,
    })
    .from(knowledgeDocuments)
    .where(
      and(
        eq(knowledgeDocuments.companyId, auth.company!.id),
        isNull(knowledgeDocuments.deletedAt),
      ),
    )
    .orderBy(desc(knowledgeDocuments.createdAt))
    .limit(200);

  return apiOk({ knowledge_bases: bases, documents: docs });
}

/** POST: buat KB baru. */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "knowledge.write");
  if (denied) return denied;

  const parsed = createKnowledgeBaseSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }

  const [row] = await db
    .insert(knowledgeBases)
    .values({
      id: newId("kb"),
      companyId: auth.company!.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      embeddingModel: parsed.data.embedding_model ?? null,
      embeddingDim: parsed.data.embedding_dim ?? 1536,
      createdBy: auth.user.id,
    })
    .returning();

  return apiOk({ knowledge_base: row }, 201);
}
