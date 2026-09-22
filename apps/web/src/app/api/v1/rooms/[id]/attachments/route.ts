import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { apiError, apiOk, authenticate, guardPermission } from "@/lib/api";
import { db } from "@/lib/db";
import { attachments, messages, rooms } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { saveUpload } from "@/lib/storage";

/** Allowlist ekstensi (mime dari browser tidak selalu bisa dipercaya). */
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml", ".ini", ".conf", ".xml",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg",
  ".zip", ".tar", ".gz",
]);

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await authenticate();
  if (auth instanceof NextResponse) return auth;

  const denied = guardPermission(auth, "message.send");
  if (denied) return denied;

  const { id } = await params;
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, auth.company!.id), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) return apiError("NOT_FOUND", "Room tidak ditemukan.", 404);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return apiError("VALIDATION_ERROR", "Field 'file' wajib diisi.", 400);
  }

  if (file.size <= 0) {
    return apiError("VALIDATION_ERROR", "File kosong.", 400);
  }
  if (file.size > env.MAX_UPLOAD_BYTES) {
    return apiError(
      "VALIDATION_ERROR",
      `Ukuran file melebihi batas ${Math.round(env.MAX_UPLOAD_BYTES / (1024 * 1024))} MB.`,
      400,
    );
  }

  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return apiError("VALIDATION_ERROR", `Tipe file tidak diizinkan: ${ext || "(tanpa ekstensi)"}`, 400);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { storageKey, fileName } = await saveUpload(buffer, file.name);

  const attachmentId = newId("att");
  const mimeType = file.type || "application/octet-stream";

  await db.insert(attachments).values({
    id: attachmentId,
    companyId: auth.company!.id,
    fileName,
    mimeType,
    sizeBytes: file.size,
    storageKey,
    uploadedBy: auth.user.id,
  });

  const messageId = newId("msg");
  const [message] = await db
    .insert(messages)
    .values({
      id: messageId,
      companyId: auth.company!.id,
      roomId: id,
      authorType: "human",
      authorUserId: auth.user.id,
      kind: "text",
      content: `📎 ${fileName}`,
      meta: {
        attachments: [
          { id: attachmentId, file_name: fileName, mime_type: mimeType, size_bytes: file.size },
        ],
      },
    })
    .returning();

  await db.update(attachments).set({ messageId }).where(eq(attachments.id, attachmentId));
  await db.update(rooms).set({ updatedAt: new Date() }).where(eq(rooms.id, id));

  await publishRoomEvent(id, "message.created", {
    message: {
      id: message.id,
      room_id: message.roomId,
      author_type: message.authorType,
      author_user_id: message.authorUserId,
      author_agent_id: message.authorAgentId,
      kind: message.kind,
      content: message.content,
      mentions: message.mentions,
      meta: message.meta,
      created_at: message.createdAt,
      user_name: auth.user.displayName,
    },
  });

  return apiOk(
    {
      message,
      attachment: {
        id: attachmentId,
        file_name: fileName,
        mime_type: mimeType,
        size_bytes: file.size,
      },
    },
    201,
  );
}
