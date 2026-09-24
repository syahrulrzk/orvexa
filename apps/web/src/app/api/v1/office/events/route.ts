import { getSessionContext } from "@/lib/session";
import { subscribe } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * SSE gateway Virtual Office (Phase 10): channel global `orvexa.office`.
 *
 * Event yang mengalir (dipublikasikan dari jalur status agent):
 *  - `agent.status`  — { agent_id, status, room_id? } tiap perubahan status
 *  - `activity.logged` — aktivitas baru untuk feed
 *
 * Klien yang reconnect disarankan memuat ulang snapshot via GET /api/v1/office.
 */
export async function GET(request: Request): Promise<Response> {
  const ctx = await getSessionContext();
  if (!ctx?.company) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
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
        `event: ready\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`,
      );

      unsubscribe = await subscribe("orvexa.office", (message) => {
        try {
          const parsed = JSON.parse(message) as { type?: string };
          write(`event: ${parsed.type ?? "office.update"}\ndata: ${message}\n\n`);
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
          // sudah ditutup
        }
      });
    },
    cancel() {
      if (ping) clearInterval(ping);
      if (unsubscribe) void unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
