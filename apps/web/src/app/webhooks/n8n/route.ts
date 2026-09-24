import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { logActivity } from "@/lib/activity";
import { apiError } from "@/lib/api";
import { db } from "@/lib/db";
import { agents, companies, messages, rooms } from "@/lib/db/schema";
import { publishRoomEvent } from "@/lib/events";
import { newId } from "@/lib/ids";
import { enqueueAgentJob } from "@/lib/jobs";
import { parseN8nInbound, verifyWebhookSignature, webhookSecret } from "@/lib/n8n";
import { RATE_LIMITS, rateLimit } from "@/lib/ratelimit";
import { readRawBody } from "@/lib/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /webhooks/n8n — aksi dari workflow n8n (F6-05).
 *
 * Keamanan (kontrak sama dengan /webhooks/monitoring, F5-07):
 *  - HMAC signature + timestamp anti-replay, constant-time compare
 *  - Rate limit per IP; fail-closed tanpa ORVEXA_WEBHOOK_SECRET
 *
 * Body:
 *   { type: "post_message",  room_id, content, kind? }
 *   { type: "trigger_agent", agent_id, room_id?, task }
 *   { type: "ping" }
 *
 * Aksi `post_message` diposting sebagai pesan system di room (terlihat di UI
 * + broadcast SSE). `trigger_agent` enqueue job agent.run (jalur sama dengan
 * mention) — agent menjalankan tugas dan melaporkan hasilnya di room.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = webhookSecret();
  if (!secret) {
    return apiError("INTERNAL_ERROR", "Webhook dinonaktifkan (ORVEXA_WEBHOOK_SECRET kosong).", 503);
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rl = await rateLimit({ key: `webhook:${ip}`, ...RATE_LIMITS.webhook });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Terlalu banyak request." } },
      { status: 429, headers: { "Retry-After": String(rl.reset_sec) } },
    );
  }

  const body = await readRawBody(request);
  const verdict = verifyWebhookSignature({
    body,
    signature: request.headers.get("x-orvexa-signature"),
    timestamp: request.headers.get("x-orvexa-timestamp"),
    secret,
  });
  if (!verdict.ok) {
    return apiError("VALIDATION_ERROR", verdict.reason, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return apiError("VALIDATION_ERROR", "Body bukan JSON valid.", 400);
  }

  const parsed = parseN8nInbound(payload);
  if (!parsed.ok) {
    return apiError("VALIDATION_ERROR", parsed.error, 400);
  }
  const action = parsed.action;

  if (action.type === "ping") {
    return NextResponse.json({ data: { ok: true, pong: true } }, { status: 200 });
  }

  // Company pertama (pola sama dengan /webhooks/monitoring; webhook
  // multi-company menyusul — catat di Backlog).
  const [companyRow] = await db
    .select({ id: companies.id })
    .from(companies)
    .orderBy(companies.createdAt)
    .limit(1);
  if (!companyRow) {
    return apiError("NOT_FOUND", "Belum ada company terdaftar.", 404);
  }
  const companyId = companyRow.id;

  // ---- post_message ----
  if (action.type === "post_message") {
    const [room] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(and(eq(rooms.id, action.room_id), eq(rooms.companyId, companyId)))
      .limit(1);
    if (!room) {
      return apiError("NOT_FOUND", "Room tidak ditemukan di company ini.", 404);
    }

    const [row] = await db
      .insert(messages)
      .values({
        id: newId("msg"),
        companyId,
        roomId: room.id,
        authorType: "system",
        kind: action.kind === "alert" ? "alert" : "text",
        content: action.content,
        mentions: [],
        meta: { via: "n8n" },
      })
      .returning();

    await publishRoomEvent(room.id, "message.created", {
      message: {
        id: row.id,
        room_id: row.roomId,
        author_type: row.authorType,
        kind: row.kind,
        content: row.content,
        mentions: row.mentions,
        meta: row.meta,
        created_at: row.createdAt,
      },
    });

    await logActivity({
      companyId,
      actor: { type: "system" },
      action: "n8n.message_posted",
      targetType: "room",
      targetId: room.id,
      roomId: room.id,
      summary: "n8n memposting pesan ke room.",
    });

    return NextResponse.json({ data: { ok: true, message_id: row.id } }, { status: 201 });
  }

  // ---- trigger_agent ----
  const [agent] = await db
    .select({ id: agents.id, name: agents.name, displayName: agents.displayName })
    .from(agents)
    .where(and(eq(agents.id, action.agent_id), eq(agents.companyId, companyId)))
    .limit(1);
  if (!agent) {
    return apiError("NOT_FOUND", "Agent tidak ditemukan di company ini.", 404);
  }

  const jobId = await enqueueAgentJob({
    companyId,
    agentId: agent.id,
    roomId: action.room_id,
    trigger: {
      kind: "manual",
      text: action.task,
      user_id: null,
      source: "n8n",
    },
  });

  await logActivity({
    companyId,
    actor: { type: "system" },
    action: "n8n.agent_triggered",
    targetType: "agent",
    targetId: agent.id,
    roomId: action.room_id,
    summary: `n8n memicu agent ${agent.displayName ?? agent.name}.`,
    metadata: { job_id: jobId, task: action.task.slice(0, 200) },
  });

  return NextResponse.json({ data: { ok: true, job_id: jobId } }, { status: 202 });
}
