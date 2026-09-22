import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission, readJson } from "@/lib/api";
import { db } from "@/lib/db";
import { activityLogs, documents } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { createDocumentSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/v1/documents?type=mop — daftar dokumen. */
export async function GET(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const docType = new URL(request.url).searchParams.get("type");
  const conds = [eq(documents.companyId, auth.company!.id), isNull(documents.deletedAt)];
  if (docType) conds.push(eq(documents.docType, docType));

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conds))
    .orderBy(desc(documents.createdAt))
    .limit(200);

  return apiOk({ documents: rows });
}

/** POST /api/v1/documents — simpan dokumen baru (hasil kerja agent/manusia). */
export async function POST(request: Request): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "document.create");
  if (denied) return denied;

  const parsed = createDocumentSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return apiError("VALIDATION_ERROR", "Input tidak valid.", 400, parsed.error.issues);
  }
  const data = parsed.data;

  const [row] = await db
    .insert(documents)
    .values({
      id: newId("doc"),
      companyId: auth.company!.id,
      projectId: data.project_id ?? null,
      roomId: data.room_id ?? null,
      taskId: data.task_id ?? null,
      decisionId: data.decision_id ?? null,
      authorUserId: auth.user.id,
      docType: data.doc_type,
      title: data.title,
      contentMd: data.content_md,
      status: data.status,
    })
    .returning();

  await db.insert(activityLogs).values({
    id: newId("act"),
    companyId: auth.company!.id,
    actorType: "human",
    actorUserId: auth.user.id,
    action: "document.created",
    targetType: "document",
    targetId: row.id,
    roomId: row.roomId,
    projectId: row.projectId,
    summary: `Dokumen ${row.docType.toUpperCase()} dibuat: ${row.title}`,
  });

  if (row.roomId) {
    await publishRoomEvent(row.roomId, "document.created", {
      document: { id: row.id, title: row.title, doc_type: row.docType, status: row.status },
    });
  }

  return apiOk({ document: row }, 201);
}
