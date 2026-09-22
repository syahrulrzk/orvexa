import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { db } from "@/lib/db";
import { knowledgeBases, knowledgeDocuments } from "@/lib/db/schema";
import {
  indexKnowledgeDocument,
  KB_MAX_FILE_BYTES,
  KB_SUPPORTED_EXTENSIONS,
} from "@/lib/knowledge";
import { newId } from "@/lib/ids";
import { saveUpload } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ kbId: string }> };

/**
 * POST multipart/form-data: upload dokumen teks ke KB lalu index
 * (chunk → embed → simpan vektor). File non-teks ditolak di MVP.
 */
export async function POST(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "knowledge.write");
  if (denied) return denied;

  const { kbId } = await params;
  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        eq(knowledgeBases.id, kbId),
        eq(knowledgeBases.companyId, auth.company!.id),
        isNull(knowledgeBases.deletedAt),
      ),
    )
    .limit(1);
  if (!kb) return apiError("NOT_FOUND", "Knowledge base tidak ditemukan.", 404);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return apiError("VALIDATION_ERROR", "Body harus multipart/form-data.", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return apiError("VALIDATION_ERROR", "Field `file` wajib diisi.", 400);
  }
  if (file.size > KB_MAX_FILE_BYTES) {
    return apiError("VALIDATION_ERROR", "Ukuran file maksimal 5 MB.", 400);
  }

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  if (!KB_SUPPORTED_EXTENSIONS.includes(ext as (typeof KB_SUPPORTED_EXTENSIONS)[number])) {
    return apiError(
      "VALIDATION_ERROR",
      `Ekstensi .${ext} belum didukung. Gunakan: ${KB_SUPPORTED_EXTENSIONS.join(", ")}.`,
      400,
    );
  }

  const title = String(form.get("title") ?? "").trim() || file.name;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { storageKey } = await saveUpload(buffer, file.name);

  const [doc] = await db
    .insert(knowledgeDocuments)
    .values({
      id: newId("kdc"),
      companyId: auth.company!.id,
      knowledgeBaseId: kbId,
      title,
      sourceType: ext,
      storageKey,
      status: "pending",
      scope: "company",
      createdBy: auth.user.id,
      metadata: { original_name: file.name, size_bytes: file.size },
    })
    .returning();

  // Index langsung (sinkron). Untuk dokumen besar, pindahkan ke job async.
  try {
    const result = await indexKnowledgeDocument({
      companyId: auth.company!.id,
      documentId: doc.id,
    });
    return apiOk({ document: { id: doc.id, title: doc.title, status: "ready" }, ...result }, 201);
  } catch (err) {
    return apiError(
      "INTERNAL_ERROR",
      err instanceof Error ? err.message : "Indexing gagal.",
      500,
      { document_id: doc.id, status: "failed" },
    );
  }
}
