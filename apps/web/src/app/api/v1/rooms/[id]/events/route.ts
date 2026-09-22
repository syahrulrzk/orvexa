import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { rooms } from "@/lib/db/schema";
import { roomChannel, subscribe } from "@/lib/redis";
import { getSessionContext } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE gateway: meneruskan event room dari Redis Pub/Sub ke browser.
 * Lihat ARCHITECTURE.md §7 dan API_SPEC.md §6.1.
 *
 * Catatan: event tidak disimpan (belum ada event store), jadi setelah
 * reconnect klien disarankan memuat ulang pesan via GET /messages.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx?.company) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const [room] = await db
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, id), eq(rooms.companyId, ctx.company.id), isNull(rooms.deletedAt)))
    .limit(1);
  if (!room) {
    return new Response("Not Found", { status: 404 });
  }

  const encoder = new TextEncoder();
  const channel = roomChannel(id);
  let unsubscribe: (() => Promise<void>) | null = null;
  let ping: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          // stream mungkin sudah ditutup
        }
      };

      write(
        `event: ready\ndata: ${JSON.stringify({ room_id: id, ts: new Date().toISOString() })}\n\n`,
      );

      unsubscribe = await subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message) as { event_id?: string; type?: string };
          const head = parsed.event_id ? `id: ${parsed.event_id}\n` : "";
          write(`${head}event: ${parsed.type ?? "message"}\ndata: ${message}\n\n`);
        } catch {
          // lewati payload rusak
        }
      });

      ping = setInterval(() => write(": ping\n\n"), 15000);

      request.signal.addEventListener("abort", () => {
        if (ping) clearInterval(ping);
        if (unsubscribe) void unsubscribe();
        try {
          controller.close();
        } catch {
          // sudah tertutup
        }
      });
    },
    async cancel() {
      if (ping) clearInterval(ping);
      if (unsubscribe) await unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
