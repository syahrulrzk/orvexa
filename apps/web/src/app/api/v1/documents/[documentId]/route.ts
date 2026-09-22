import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, documents } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { updateDocumentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ documentId: string }> };

/** GET detail dokumen. */
export async function GET(_request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const { documentId } = await params;
  const [row] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.companyId, auth.company!.id),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return apiError("NOT_FOUND", "Dokumen tidak ditemukan.", 404);

  return apiOk({ document: row });
}

/**
 * PATCH dokumen. Perubahan `content_md` pada dokumen final membuat
 * versi baru otomatis (version + 1, status kembali draft) — jejak revisi.
 */
export async function PATCH(request: Request, { params }: Params): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "document.create");
  if (denied) return denied;

  const { documentId } = await params;
  const parsed = updateDocumentSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [existing] = await db
    .select({ id: documents.id, status: documents.status, version: documents.version, roomId: documents.roomId })
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.companyId, auth.company!.id),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  if (!existing) return apiError("NOT_FOUND", "Dokumen tidak ditemukan.", 404);

  const contentChanged = data.content_md !== undefined;
  const wasFinal = existing.status === "final";
  const newVersion = contentChanged && wasFinal ? existing.version + 1 : existing.version;
  const newStatus = contentChanged && wasFinal ? "draft" : (data.status ?? existing.status);

  const [row] = await db
    .update(documents)
    .set({
      ...(data.title !== undefined ? { title: data.title } : {}),
      ...(contentChanged ? { contentMd: data.content_md! } : {}),
      ...(data.status !== undefined && !contentChanged ? { status: data.status } : {}),
      version: newVersion,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, documentId))
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "document.updated",
    targetType: "document",
    targetId: row.id,
    roomId: row.roomId,
    summary: `Dokumen diupdate (v${row.version}): ${row.title}`,
    metadata: { version: row.version, status: row.status, content_changed: contentChanged },
  });

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "document.created", {
      document: { id: row.id, title: row.title, doc_type: row.docType, status: row.status, version: row.version },
    });
  }

  return apiOk({ document: row });
}
