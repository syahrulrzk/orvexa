import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { attachments } from "@/lib/db/schema";
import { readUpload } from "@/lib/storage";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx?.company) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const [row] = await db
    .select()
    .from(attachments)
    .where(and(eq(attachments.id, id), eq(attachments.companyId, ctx.company.id)))
    .limit(1);

  if (!row) {
    return new Response("Not Found", { status: 404 });
  }

  try {
    const data = await readUpload(row.storageKey);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": row.mimeType,
        "Content-Length": String(row.sizeBytes),
        "Content-Disposition": `inline; filename="${encodeURIComponent(row.fileName)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("File tidak ditemukan di storage.", { status: 410 });
  }
}
